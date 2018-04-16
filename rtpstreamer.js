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
        this.rtmpURL = 
        this.sdp = null
        this.audioCodec = null;
        this.videoCodec = null;
        this.audioMediaSdp = null;
        this.videoMediaSdp = null;
        this.audioport = options.audioport || null;
        this.videoport = options.videoport || null;
        this.host = options.host;
        this.recordCommand = null;

        this.state = Stream.ready;
        this.outputType = options.outputType || OutputTypes.MKV;

        this.rtmpURL = options.rtmpURL || null;
        this.recorddir = options.recorddir || './';

        this.initSdp();

    }
    async enableVideo(codec,payloadType,clockRate)
    {
        let _codec = {
            kind: 'video',
            codec: codec,
            payloadType : payloadType,
            clockRate : clockRate
        }
        this.videoCodec = _codec;
        this.formatMediaSdp(_codec);

        this.videoport = await this.getMediaPort();
        this.videoMediaSdp.port = this.videoport;
        this.sdp.media.push(this.videoMediaSdp);
    }
    async enableAudio(codec,payloadType,channels,clockRate)
    {
        let _codec = {
            kind: 'audio',
            codec: codec,
            payloadType : payloadType,
            clockRate : clockRate,
            numChannels : channels
        }
        this.audioCodec = _codec;
        this.formatMediaSdp(_codec);
        this.audioport = await this.getMediaPort();
        this.audioMediaSdp.port = this.audioport;
        this.sdp.media.push(this.audioMediaSdp);
    }
    start()
    {

        let sdpstr =  transform.write(this.sdp);

        debug('sdp ', sdpstr);
        
        let sdpStream = new stream.PassThrough();
        sdpStream.end(new Buffer(sdpstr));

        let self = this;

        this.recordCommand = ffmpeg(sdpStream)
            .inputOptions([
                    '-protocol_whitelist', 
                    'file,pipe,udp,rtp', 
                    '-f', 'sdp',
                    '-acodec libopus',
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
            this.recordFilePath = path.join(this.recorddir,this.id + '.mkv');
            this.recordCommand.output(this.recordFilePath)
                .outputOptions([
                    '-y',
                    '-r:v 20',
                    '-copyts',
                    '-vsync 1',
                    '-c copy',
                    '-f matroska'
                    ]);

        } else if(OutputTypes.RTMP === this.outputType){ // we disable rtmp for now 
            let outputOptions = ['-f flv',];

            // only 264 for now 
            if(this.videoCodec){
                outputOptions.unshift('-vcodec copy');
            }
            if(this.audioCodec){
                outputOptions.unshift('-r:v 20');
                outputOptions.unshift('-copyts');
                outputOptions.unshift('-copytb 1');
                outputOptions.unshift('-ar 44100');
                outputOptions.unshift('-acodec aac');
            }

            let rtmpaddress = this.rtmpURL + '/' + this.id;
            this.recordCommand.output(this.rtmpaddress)
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
            codec:codec.name,
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

        if(codec.parameters) {
            let configs = [];

            for(let parameter in codec.parameters) {
                let parameterName = parameter.split(/(?=[A-Z])/).join('-').toLowerCase();
                configs.push(parameterName + '=' + codec.parameters[parameter]);
            }
            
            if(configs.length) {
                if(!media.fmtp) {
                    media.fmtp = [];
                }

                media.fmtp.push({
                    payload: codec.payloadType,
                    config: configs.join(';')
                });	
            }
        }

        if(codec.rtcpFeedback && codec.rtcpFeedback.length) {
            if(!media.rtcpFb) {
                media.rtcpFb = [];
            }
            for(let j = 0; j < codec.rtcpFeedback.length; j++) {
                let rtcpFeedback = codec.rtcpFeedback[j];
                media.rtcpFb.push({
                    payload: codec.payloadType,
                    type: rtcpFeedback.type,
                    subtype: rtcpFeedback.parameter,
                });
            }
        }

        media.rtp.push(rtp);
        if(codec.kind === 'video'){
            this.videoMediaSdp = media;
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


module.exports = 
{
    Stream:Stream,
    OutputTypes:OutputTypes
};
