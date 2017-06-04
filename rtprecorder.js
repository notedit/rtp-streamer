'use strict'

const getPort = require('get-port');
const EventEmitter = require('events').EventEmitter;
const ffmpeg = require('fluent-ffmpeg');
const transform = require('sdp-transform');
const streamBuffers = require('stream-buffers');




class RtpRecorder extends EventEmitter
{

    constructor(options)
    {

        super();
		this.setMaxListeners(Infinity);

        this._streams = new Map();
        this._host = '127.0.0.1';
    }

    /*
    {
    "audio": {
        "port": "<int>",
        "host": "<string>"
        },
    "video": {
        "port": "<int>",
        "host": "<string>"
        }
    }
    */
    async create(streamId,codecs)
    {
        let stream = {};
        let sdp = this.formatSdp();
        for(let codec of codecs){
            if(codec.kind === 'audio'){
                let audioport = await this.getMediaPort();
                stream.audio = {
                    port:audioport,
                    host:this._host
                };
                let audiosdp = this.formatMediaSdp(codec,audioport);
                sdp.media.push(audiosdp);
            }

            if(codec.kind === 'video'){
                let videoport = await this.getMediaPort();
                stream.video = {
                    port:videoport,
                    host:this._host
                };
                let videosdp = this.formatMediaSdp(codec,videoport);
                sdp.media.push(videosdp);
            }
        }

        this._streams.set(streamId,sdp);
        return stream;
    }
    startRecording(streamId)
    {
        if(!this._streams.get(streamId)){
            return;
        }
        let sdpBuffer = new streamBuffers.ReadableStreamBuffer({
            frequency: 10,       // in milliseconds.
            chunkSize: 2048     // in bytes.
        });

        let sdp = this._streams.get(streamId);

        let sdpstr =  transform.write(sdp);

        sdpBuffer.put(sdpstr);


        ffmpeg(sdpBuffer)
        .inputOptions(['-re','-protocol_whitelist', 'file,pipe,udp,rtp', '-f', 'sdp','-analyzeduration','10000000'])
        .on('start', function(commandLine) {
                console.log('Spawned Ffmpeg with command: ' + commandLine);
        })
        .on('error', function(err, stdout, stderr) {

            console.log('ffmpeg stderr: ' + stderr);
        })
        .on('end',function() {
            console.log('ended');
        })
        .outputOptions(['-c', 'copy'])
        .save(streamId + '.webm');


    }
    stopRecording(streamId)
    {

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
        let media = {
            rtp:[{
                payload:codec.payloadType,
                codec:codec.name.substr(codec.name.indexOf('/') + 1),
                rate:codec.clockRate
            }],
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
            let port = await getPort();
            if(!port%2){
                return port;
            }
        }
    }
    
}