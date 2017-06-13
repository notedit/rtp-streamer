'use strict'


const fs  =  require('fs');
const path = require('path');
const util = require('util');
const stream = require('stream');
const EventEmitter = require('events').EventEmitter;
const ffmpeg = require('fluent-ffmpeg');
const transform = require('sdp-transform');
const getPort = require('get-port');

const debug = require('debug')('debug');
const error = require('debug')('error');



const OutputTypes = {
	RTMP: 1,
	MKV: 2
}


class Stream extends EventEmitter
{
    constructor(options)
    {
        super();
        this.setMaxListeners(Infinity);

        this.id = options.streamId;
        this.sdp = null
        this.audioCodec = null;
        this.videoCodec = null;
        this.audioMediaSdp = null;
        this.videoMedisSdp = null;
        this.audioport = options.audioport || null;
        this.videoport = options.videoport || null;
        this.host = options.host;
        this.recordCommand = null;

        this.state = Stream.ready;
        this.recorder = options.recorder;
        this.outputType = options.outputType;

        this.rtmpURL = null;
        this.recordFilePath = null;

        this.initSdp();

    }
    async enableVideo(codec)
    {
        this.videoCodec = codec;
        this.formatMediaSdp(codec);
        //this.videoport = await this.getMediaPort();
        this.videoport = 10000;
        this.videoMedisSdp.port = this.videoport;
        this.sdp.media.push(this.videoMedisSdp);
    }
    async enableAudio(codec)
    {
        this.audioCodec = codec;
        this.formatMediaSdp(codec);
        //this.audioport = await this.getMediaPort();
        this.audioport = 10002;
        this.audioMediaSdp.port = this.audioport;
        this.sdp.media.push(this.audioMediaSdp);
    }
    startRecording()
    {

        let sdpstr =  transform.write(this.sdp);

        debug('sdp ', sdpstr);
        
        let sdpStream = new stream.PassThrough();
        sdpStream.end(new Buffer(sdpstr));

        let self = this;

        this.recordCommand = ffmpeg(sdpStream)
            .inputOptions(['-protocol_whitelist', 'file,pipe,udp,rtp', '-f', 'sdp',
                '-analyzeduration 11000000'
            ])
            .on('start', function(commandLine) {
                debug('Spawned Ffmpeg with command: ' + commandLine);
                self.state = Stream.started;
            })
            .on('error', function(err, stdout, stderr) {
                error('ffmpeg stderr: ' + stderr);
                self.close(err);
            })
            .on('end',function() {
                debug('ended');
                self.close(null);
            });   
        
        if(OutputTypes.MKV === this.outputType){
            this.recordFilePath = path.join(this.recorder._recorddir,this.id + '.mkv');
            this.recordCommand.output(this.recordFilePath)
                .outputOptions([
                    '-y',
                    '-c copy',
                    '-f matroska'
                    ]);

        } else if(OutputTypes.RTMP === this.outputType){
            let outputOptions = ['-f flv','-max_muxing_queue_size 400'];

            if(this.videoCodec){
                outputOptions.unshift('-vcodec libx264');
            }
            if(this.audioCodec){
                outputOptions.unshift('-ar 44100');
                outputOptions.unshift('-acodec aac');
            }

            this.rtmpURL = this.recorder._rtmpbase + this.id;
            this.recordCommand.output(this.rtmpURL)
                .outputOptions(outputOptions);
        }

        this.recordCommand.run();

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
        if(!error){
            this.emit('finished', null);
        }   
        this.emit('close',error);  
 
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
        return port;
    }
    formatMediaSdp(codec)
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
            rtp:[],
            type: codec.kind,
            protocol: 'RTP/AVP',
            port:0,
            payloads:codec.payloadType
        };

        media.rtp.push(rtp);
        if(codec.kind === 'video'){
            this.videoMedisSdp = media;
        } else {
            this.audioMediaSdp = media;
        }

    }
    initSdp()
    {
        this.sdp = {
            version:0,
            origin:{
                username:'dotEngine',
                sessionId: 0,
                sessionVersion: 0,
                netType: 'IN',
                ipVer: 4,
                address: this.host
            },
            name:'dotEngine',
            timing:{
                start:0,
                stop:0
            },
            connection: {
                version: 4, 
                ip: this.host
            },
            media:[
            ]
        };
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
        this._rtmpbase = options.rtmpbase || '';
    }
    get streams()
    {
        return this._streams;
    }
    create(streamId,outputType)
    {
        let options = {
            streamId:streamId,
            host:this._host,
            outputType:outputType
        };

        if(outputType === OutputTypes.RTMP){
            if(!this._rtmpbase){
                throw new Error('rtmp must with rtmpbase');
            }
        }

        options.recorder = this;
        let rtpstream = new Stream(options);

        rtpstream.on('close',(err) => {
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
}

module.exports = 
{
    OutputTypes:OutputTypes,
    Stream:Stream,
    RtpRecorder:RtpRecorder
};
