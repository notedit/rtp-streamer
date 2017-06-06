'use strict'



const randomstring = require("randomstring")
const Recorder = require('../index').RtpRecorder;
const ffmpeg =  require('fluent-ffmpeg');

const debug = require('debug')('debug');

const recorder  = new Recorder({
    host:'127.0.0.1'
});


const codecs = [
			{
				kind        : 'audio',
				name        : 'audio/opus',
                payloadType : 100,
				clockRate   : 48000,
                numChannels : 2,
			},
			{
				kind        : 'video',
				name        : 'video/vp8',
				payloadType : 110,
				clockRate   : 90000
			}
		];


let streamId = randomstring.generate();
let stream = recorder(streamId, codecs);

/*
        this.audioport = options.audioport;
        this.videoport = options.videoport;
        this.host = options.host;
*/

let videoout = 'rtp://' + stream.host + ':' + stream.videoport;
let audioout = 'rtp://' + stream.host + ':' + stream.audioport;

ffmpeg('./vp8opus.webm').native()
    .output(videoout)
    .outputOptions([
        '-vcodec copy',
        '-an',
        '-f rtp'
        ])
    .output(audioout)
    .outputOptions([
        '-acodec copy',
        '-vn',
        '-f rtp'
    ])
    .on('start', function(command) {
         console.log('Spawned Ffmpeg with command: ' + command);
         
         stream.startRecording();
    })
    .on('error', function(err){
        console.log('An error occurred: ' + err);
    })
    .on('stderr',function(stderrLine){
        console.log(stderrLine);
    })
    .on('progress', function(progress) {
        debug('Processing: frames' + progress.frames + ' currentKbps ' + progress.currentKbps);
    })
    .on('end',function(){
        console.log('Processing finished !');
    })
    .run();



