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


    /**
	 * Create new RTMPStreamer
	 * @param {Object} params
     * @param {Number} params.audioPort   - audio rtp port 
     * @param {Number} params.videoPort   - video rtp port 
     * @param {String} params.rtmpURL     - out rtmp url 
     * 
     * @param {Object} params.audio       - audio codec info 
     * @param {Number} params.audio.payload  - audio rtp payload
     * @param {Number} params.audio.rate  - audio rate 
     * @param {String} params.audio.codec   - audio rtp code name, ('opus', 'aac')
     * @param {Number?} params.audio.channels - audio channels,  (1  or  2)
     * @param {Object?} params.audio.parameters  - audio other sdp parameters 
     *  
     * @param {Object} params.video       - video codec info 
     * @param {Number} params.video.payload  - video rtp payload
     * @param {Number} params.video.rate   - video rate
     * @param {String} params.video.codec   - video rtp code name, ('h264', 'vp8')
     * @param {Object?} params.video.parameters  - audio other sdp parameters  
	 */
    constructor(options)
    {
        super();

        this.rtmpURL = options.rtmpURL;
       
        this.audioCodec = options.audio;
        this.videoCodec = options.video;
        this.audioPort = options.audioPort || null;
        this.videoPort = options.videoPort || null;
        this.command = null;

        this.state = STATE.ready;
        this.sdp = this._initSDP();
    }

    start() 
    {

        console.log(this.sdp);

        let sdpstr =  transform.write(this.sdp);
        let sdpStream = new stream.PassThrough();
        sdpStream.end(new Buffer(sdpstr));

        // input options 
        let inputOptions = [
            '-protocol_whitelist', 
            'file,pipe,udp,rtp', 
            '-f', 'sdp',
            '-analyzeduration 2147483647',
            '-probesize 2147483647'
        ];

        if (this.audioCodec && this.audioCodec.codec === 'opus') {
            inputOptions.push('-acodec libopus')
        }

        this.command = ffmpeg(sdpStream)
            .inputOptions(inputOptions)
            .on('start', (commandLine) => {
                console.log('ffmpeg command : ',  commandLine);
                this.state = STATE.started;
                this.emit('start', commandLine)
            })
            .on('progress', function(progress) {
                console.log('Processing: frames' + progress.frames + ' currentKbps ' + progress.currentKbps);
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
                outputOptions.push('-tune zerolatency');
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

        outputOptions.push('-f flv')

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
            let media = this._mediaSDP(this.audioCodec, 'audio', this.audioPort)
            medias.push(media)
        }

        if (this.videoCodec) {
            let media = this._mediaSDP(this.videoCodec, 'video', this.videoPort)
            medias.push(media)
        }

        const sdp = {
            version:0,
            origin:{
                username:'-',
                sessionId: 0,
                sessionVersion: 0,
                netType: 'IN',
                ipVer: 4,
                address: '127.0.0.1'
            },
            name:'-',
            timing:{
                start:0,
                stop:0
            },
            connection: {
                version: 4, 
                ip: '127.0.0.1'
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

    /**
	 * Create new RecordStreamer
	 * @param {Object} params
     * @param {Number} params.audioPort   - audio rtp port 
     * @param {Number} params.videoPort   - video rtp port 
     * @param {String} params.filename    - out record filename,  only xxx/xxxx.mkv support now 
     * 
     * @param {Object} params.audio       - audio codec info 
     * @param {Number} params.audio.payload  - audio rtp payload
     * @param {Number} params.audio.rate  - audio rate 
     * @param {String} params.audio.codec   - audio rtp code name, ('opus', 'aac')
     * @param {Number?} params.audio.channels - audio channels,  (1  or  2)
     * @param {Object?} params.audio.parameters  - audio other sdp parameters 
     *  
     * @param {Object} params.video       - video codec info 
     * @param {Number} params.video.payload  - video rtp payload
     * @param {Number} params.video.rate   - video rate
     * @param {String} params.video.codec   - video rtp code name, ('h264', 'vp8')
     * @param {Object?} params.video.parameters  - audio other sdp parameters  
	 */
    constructor(options)
    {
        super();

        this.audioCodec = options.audio;
        this.videoCodec = options.video;
        this.audioPort = options.audioPort || null;
        this.videoPort = options.videoPort || null;
        this.command = null;

        this.state = STATE.ready;
        this.filename = options.filename;

        this.sdp = this._initSDP();
    }

    start() 
    {

        console.log(this.sdp);

        let sdpstr =  transform.write(this.sdp);
        let sdpStream = new stream.PassThrough();
        sdpStream.end(new Buffer(sdpstr));

        console.log(sdpstr);
        return;
        // input options 
        let inputOptions = [
            '-protocol_whitelist', 
            'file,pipe,udp,rtp', 
            '-f', 'sdp',
            '-acodec libopus',
            '-analyzeduration 2147483647',
            '-probesize 2147483647'
        ];

        this.command = ffmpeg(sdpStream)
            .inputOptions(inputOptions)
            .on('start', (commandLine) => {

                console.log('ffmpeg command : ',  commandLine);
                this.state = STATE.started;
                this.emit('start', commandLine)
            })
            .on('progress', function(progress) {
                console.log('Processing:', progress);
            })
            .on('error', (err, stdout, stderr) => {
                console.error('error ', err);
                console.error('ffmpeg stdout: ', stdout);
                console.error('ffmpeg stderr: ', stderr);
                this.close(err);
            })
            .on('end',(err) => {
                console.log('ended');
                this.close(err);
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
            let media = this._mediaSDP(this.audioCodec, 'audio', this.audioPort)
            medias.push(media)
        }

        if (this.videoCodec) {
            let media = this._mediaSDP(this.videoCodec, 'video', this.videoPort)
            medias.push(media)
        }

        const sdp = {
            version:0,
            origin:{
                username:'-',
                sessionId: 0,
                sessionVersion: 0,
                netType: 'IN',
                ipVer: 4,
                address: '127.0.0.1'
            },
            name:'-',
            timing:{
                start:0,
                stop:0
            },
            connection: {
                version: 4, 
                ip: '127.0.0.1'
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
