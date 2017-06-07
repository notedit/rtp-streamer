'use strict'


const fs  =  require('fs');
const util = require('util');
const stream = require('stream');
const EventEmitter = require('events').EventEmitter;
const ffmpeg = require('fluent-ffmpeg');
const transform = require('sdp-transform');
const streamBuffers = require('stream-buffers');
const getPort = require('get-port');

const debug = require('debug')('debug');
const error = require('debug')('error');

class Stream extends EventEmitter
{
    constructor(options)
    {
        super();
		this.setMaxListeners(Infinity);

        this.id = options.streamId;
        this.sdp = options.sdp;
        this.codecs = options.codecs;
        this.audioport = options.audioport;
        this.videoport = options.videoport;
        this.host = options.host;
        this.recordCommand = null;
        this.thumbnailCommand = null;

        this.state = Stream.ready;
        this.recorder = options.recorder;
        
    }
    startRecording()
    {
        let sdpBuffer = new streamBuffers.ReadableStreamBuffer({
            frequency: 10,       // in milliseconds.
            chunkSize: 1024     // in bytes.
        });

        let sdpstr =  transform.write(this.sdp);

        debug('sdp ', sdpstr);
        
        let  bufferStream = new stream.PassThrough();
        bufferStream.end(new Buffer(sdpstr));

        let recordName = util.format('%s/%s-%d.webm', this.recorder._recorddir,this.id,(new Date()).getTime());

        let self = this;

        this.recordCommand = ffmpeg(bufferStream)
            .inputOptions(['-protocol_whitelist', 'file,pipe,udp,rtp', '-f', 'sdp'])
            .on('start', function(commandLine) {
                debug('Spawned Ffmpeg with command: ' + commandLine);
                self.state = Stream.started;
            })
            .on('error', function(err, stdout, stderr) {
                error('ffmpeg stderr: ' + stderr);
                self.close(err);
            })
        
            .on('progress', function(progress) {
                //debug('Processing: frames' + progress.frames + ' currentKbps ' + progress.currentKbps);
            })
            .on('end',function() {
                debug('ended');
                self.close(null);
            })
           
            .outputOptions([
                '-c copy',
                '-f webm'
            ])
            .save(recordName);

    }
    close(error)
    {

        if(this.state === Stream.closed){
            return;
        }

        if(this.recordCommand){
            this.recordCommand.kill();
        }

        this.state = Stream.closed
        this.recordCommand = null;
        this.emit('close',error);      
    }
}

Stream.ready = 'ready';
Stream.started = 'started';
Stream.closed = 'closed';


class RtpRecorder extends EventEmitter
{

    constructor(options)
    {

        super();
		this.setMaxListeners(Infinity);

        this._options = options;
        this._streams = new Map();
        this._host = options.host;
        this._minPort = options.minPort || 20000;
        this._recorddir = options.recorddir || '.';
    }
    get streams()
    {
        return this._streams;
    }
    async create(streamId,codecs)
    {
        let options = {
            streamId:streamId,
            host:this._host,
            codecs:codecs
        };
        let sdp = this.formatSdp();
        for(let codec of codecs){
            if(codec.kind === 'video'){
                let videoport = await this.getMediaPort();
                debug('videoport ',videoport);
                options.videoport = videoport;
                let videosdp = this.formatMediaSdp(codec,videoport);
                sdp.media.push(videosdp);
            }
            if(codec.kind === 'audio'){
                let audioport = await this.getMediaPort();
                debug('audioport ', audioport);
                options.audioport = audioport;
                let audiosdp = this.formatMediaSdp(codec,audioport);
                sdp.media.push(audiosdp);
            }
        }
        options.sdp = sdp;
        options.recorder = this;
        let rtpstream = new Stream(options);

        rtpstream.on('close',() => {
            this._streams.delete(rtpstream.id);
        });

        this._streams.set(streamId,rtpstream);
        return rtpstream;
    }
    stream(streamId)
    {
        if(!this._streams.get(streamId)){
            return null;
        }

        return this._streams.get(streamId);
    }
    formatSdp(streamCodecs)
    {

        let sdp = {
            version:0,
            origin:{
                username:'dotEngine',
                sessionId: 0,
                sessionVersion: 0,
                netType: 'IN',
                ipVer: 4,
                address: this._host
            },
            name:'dotEngine',
            timing:{
                start:0,
                stop:0
            },
            connection: {
                version: 4, 
                ip: this._host
            },
            media:[
            ]
        }

        return sdp;
    }
    formatMediaSdp(codec,port)
    {

        let rtp = {
                payload:codec.payloadType,
                codec:codec.name.substr(codec.name.indexOf('/') + 1),
                rate:codec.clockRate
            };

        if(codec.numChannels){
            rtp.encoding = codec.numChannels;
        }
        let media = {
            rtp:[rtp],
            type: codec.kind,
            protocol: 'RTP/AVP',
            port:port,
            payloads:codec.payloadType
        };

        return media;
    }
    async getMediaPort()
    {

        let port;
        while(true)
        {

            port = await getPort();
            if(port%2 == 0){
                break;
            }
        }
        
        return port
    }
    
}


module.exports = 
{
    Stream:Stream,
    RtpRecorder:RtpRecorder
};