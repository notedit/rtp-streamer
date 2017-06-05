'use strict'

const util = require('util');
const getPort = require('get-port');
const EventEmitter = require('events').EventEmitter;
const ffmpeg = require('fluent-ffmpeg');
const transform = require('sdp-transform');
const streamBuffers = require('stream-buffers');



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
                console.log('Spawned Ffmpeg with command: ' + commandLine);
                this.state = Stream.started;
            })
            .on('error', function(err, stdout, stderr) {
                console.log('ffmpeg stderr: ' + stderr);
                this.close(err);
            })
            .on('stderr',function(stderrLine){
                console.log(stderrLine);
            })
            .on('progress', function(progress) {
                console.log('Processing: frames' + progress.frames + ' currentKbps ' + progress.currentKbps);
            })
            .on('end',function() {
                console.log('ended');
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

        this._streams = new Map();
        this._host = '127.0.0.1';
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
            if(codec.kind === 'audio'){
                let audioport = await this.getMediaPort();
                options.audioport = audioport;
                let audiosdp = this.formatMediaSdp(codec,audioport);
                sdp.media.push(audiosdp);
            }

            if(codec.kind === 'video'){
                let videoport = await this.getMediaPort();
                options.videoport = videoport;
                let videosdp = this.formatMediaSdp(codec,videoport);
                sdp.media.push(videosdp);
            }
        }
        options.sdp = sdp;
        let stream = new Stream(options);

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