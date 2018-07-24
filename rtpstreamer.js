'use strict'


const fs  =  require('fs');
const path = require('path');
const util = require('util');
const stream = require('stream');
const EventEmitter = require('events').EventEmitter;
const ffmpeg = require('fluent-ffmpeg');
const transform = require('sdp-transform');
const getPort = require('get-port');


const STATE = {
    ready:'ready',
    started:'started',
    closed:'closed'
}


async function getMediaPort()
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

class RTMPStreamer extends EventEmitter 
{
    /*
    
    */
    constructor(options)
    {
        super();

        this.rtmpURL = options.rtmpURL;
       
        this.audioCodec = null;
        this.videoCodec = null;
        this.audioPort = options.audioPort || null;
        this.videoPort = options.videoPort || null;
        this.command = null;

        this.state = STATE.ready;
        this.sdp = this._initSDP();
    }

    start() 
    {
        let sdpstr =  transform.write(this.sdp);
        let sdpStream = new stream.PassThrough();
        sdpStream.end(new Buffer(sdpstr));

        this.command = ffmpeg(sdpStream)

        // input options 
        let inputOptions = [
            '-protocol_whitelist', 
            'file,pipe,udp,rtp', 
            '-f', 'sdp',
            '-analyzeduration 11000000',
        ];

        if (this.audioCodec && this.audioCodec.codec === 'opus') {
            inputOptions.push('-acodec libopus')
        }

        this.command.inputOptions(inputOptions)
            .on('start', (commandLine) => {
                console.log('ffmpeg command : ',  commandLine);
                this.state = STATE.started;
                this.emit('start', commandLine)
            })
            .on('error', (err, stdout, stderr) => {
                console.error('ffmpeg stdout: ', stdout);
                console.error('ffmpeg stderr: ', stderr);
                this.close(err);
            })
            .on('end',() => {
                console.log('ended');
                this.close(null);
            });

        let outputOptions = [];

        // outputOptions 
        if(this.videoCodec) {
            if (this.videoCodec.codec === 'h264'){
                outputOptions.push('-vcodec copy');
            } else {
                outputOptions.push('-vcodec libx264');
                outputOptions.push('-preset ultrafast');
                outputOptions.push('-crf 0');
            }
        }

        if(this.audioCodec){
            outputOptions.push('-acodec aac');
            outputOptions.push('-ar 44100');
            outputOptions.push('-copytb 1');
            outputOptions.push('-copyts');
            outputOptions.push('-r:v 20');
        }

        this.command.output(this.rtmpURL)
            .outputOptions(outputOptions);

        this.command.run();
    }

    close(reason) 
    {
        if(this.state === STATE.closed){
            return;
        }

        if(this.command){
            this.command.kill();
        }
        this.state = STATE.closed
        this.command  = null;

        this.emit('close',reason);   
    }

    _initSDP()
    {
        const medias = [];

        if (this.audioCodec) {
            medias.push(this.audioCodec,'audio',this.audioPort)
        }

        if (this.videoCodec) {
            medias.push(this.videoCodec,'video',this.videoPort)
        }

        const sdp = {
            version:0,
            origin:{
                username:'-',
                sessionId: 0,
                sessionVersion: 0,
                netType: 'IN',
                ipVer: 4,
                address: this.host
            },
            name:'-',
            timing:{
                start:0,
                stop:0
            },
            connection: {
                version: 4, 
                ip: this.host
            },
            media:medias
        };

        return sdp

    }
    _mediaSDP(codec,kind,port)
    {

        let rtp = {
            payload:codec.payload,
            codec:codec.codec, // h264 or other 
            rate:codec.rate
        };

        if(codec.channels){
            rtp.encoding = codec.channels;
        }
        const media = {
            rtp:[],
            type: kind,  // audio or video 
            protocol: 'RTP/AVP',
            port:port,
            payloads:codec.payload
        };

        media.rtp.push(rtp);

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
                    payload: codec.payload,
                    config: configs.join(';')
                });	
            }
        }

        return media
    }
}


class RecordStreamer extends EventEmitter 
{
    constructor(options)
    {
        super();

        this.id = options.id;

        this.audioCodec = null;
        this.videoCodec = null;
        this.audioPort = options.audioPort || null;
        this.videoPort = options.videoPort || null;
        this.command = null;

        this.state = STATE.ready;
        this.filename = options.filename;

        this.sdp = this._initSDP();
    }

    start() 
    {
        let sdpstr =  transform.write(this.sdp);
        let sdpStream = new stream.PassThrough();
        sdpStream.end(new Buffer(sdpstr));

        this.command = ffmpeg(sdpStream)

        // input options 
        let inputOptions = [
            '-protocol_whitelist', 
            'file,pipe,udp,rtp', 
            '-f', 'sdp',
            '-analyzeduration 11000000',
        ];

        if (this.audioCodec && this.audioCodec.codec === 'opus') {
            inputOptions.push('-acodec libopus')
        }

        this.command.inputOptions(inputOptions)
            .on('start', (commandLine) => {
                console.log('ffmpeg command : ',  commandLine);
                this.state = STATE.started;
                this.emit('start', commandLine)
            })
            .on('error', (err, stdout, stderr) => {
                console.error('ffmpeg stdout: ', stdout);
                console.error('ffmpeg stderr: ', stderr);
                this.close(err);
            })
            .on('end',() => {
                console.log('ended');
                this.close(null);
            });

        let outputOptions = [
            '-y',
            '-r:v 20',
            '-copyts',
            '-vsync 1',
            '-c copy',
            '-f matroska'
        ];

        this.command.output(this.filename)
            .outputOptions(outputOptions);

        this.command.run();
    }

    close(reason) 
    {
        if(this.state === STATE.closed){
            return;
        }

        if(this.command){
            this.command.kill();
        }
        this.state = STATE.closed
        this.command  = null;

        this.emit('close',reason);   
    }

    _initSDP()
    {
        const medias = [];

        if (this.audioCodec) {
            medias.push(this.audioCodec,'audio',this.audioPort)
        }

        if (this.videoCodec) {
            medias.push(this.videoCodec,'video',this.videoPort)
        }

        const sdp = {
            version:0,
            origin:{
                username:'-',
                sessionId: 0,
                sessionVersion: 0,
                netType: 'IN',
                ipVer: 4,
                address: this.host
            },
            name:'-',
            timing:{
                start:0,
                stop:0
            },
            connection: {
                version: 4, 
                ip: this.host
            },
            media:medias
        };

        return sdp

    }
    _mediaSDP(codec,kind,port)
    {

        let rtp = {
            payload:codec.payload,
            codec:codec.codec, // h264 or other 
            rate:codec.rate
        };

        if(codec.channels){
            rtp.encoding = codec.channels;
        }
        const media = {
            rtp:[],
            type: kind,  // audio or video 
            protocol: 'RTP/AVP',
            port:port,
            payloads:codec.payload
        };

        media.rtp.push(rtp);

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
                    payload: codec.payload,
                    config: configs.join(';')
                });	
            }
        }

        return media
    }
}


module.exports = 
{
    RTMPStreamer,
    RecordStreamer,
    getMediaPort  
};
