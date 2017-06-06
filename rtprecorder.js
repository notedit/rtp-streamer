'use strict'


const util = require('util');
const portfinder = require('portfinder');
const EventEmitter = require('events').EventEmitter;
const ffmpeg = require('fluent-ffmpeg');
const transform = require('sdp-transform');
const streamBuffers = require('stream-buffers');

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
        
    }
    startRecording()
    {
        let sdpBuffer = new streamBuffers.ReadableStreamBuffer({
            frequency: 10,       // in milliseconds.
            chunkSize: 1024     // in bytes.
        });

        let sdpstr =  transform.write(this.sdp);
        sdpBuffer.put(sdpstr);
        
        let recordName = util.format('%s-%d.webm', this.id,(new Date()).getTime());

        this.recordCommand = ffmpeg(sdpBuffer)
            .inputOptions(['-re','-protocol_whitelist', 'file,pipe,udp,rtp', '-f', 'sdp','-analyzeduration','10000000'])
            .on('start', function(commandLine) {
                debug('Spawned Ffmpeg with command: ' + commandLine);
                this.state = Stream.started;
            })
            .on('error', function(err, stdout, stderr) {
                debug('ffmpeg stderr: ' + stderr);
                this.close(err);
            })
            .on('stderr',function(stderrLine){
                error(stderrLine);
            })
            .on('progress', function(progress) {
                debug('Processing: frames' + progress.frames + ' currentKbps ' + progress.currentKbps);
            })
            .on('end',function() {
                debug('ended');
                this.close();
            })
            .output(recordName)
            .outputOptions([
                '-c copy',
                '-f webm' 
            ])
            .run();

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

        portfinder.basePort = this._minPort;
        
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
        let stream = new Stream(options);

        debug('new stream ', options);

        stream.on('close',() => {
            this._streams.delete(stream.id);
        });

        this._streams.set(streamId,stream);
        return stream;
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

        if(code.numChannels){
            rtp.encoding = code.numChannels;
        }
        let media = {
            rtp:[rtp],
            type: codec.kind,
            protocol: 'RTP/AVP',
            port:0,
            payloads:codec.payloadType
        };

        return media;
    }
    async getMediaPort()
    {
        while(true)
        {
            let port = await portfinder.getPortPromise();
            if(!port%2){
                return port;
            }
        }
    }
    
}


module.exports = 
{
    Stream:Stream,
    RtpRecorder:RtpRecorder
};