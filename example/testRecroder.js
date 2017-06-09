'use strict'


const randomstring = require("randomstring")
const Recorder = require('../index').RtpRecorder;
const ffmpeg =  require('fluent-ffmpeg');

const OutputTypes = require('../index').OutputTypes;
const debug = require('debug')('debug');

const recorder  = new Recorder({
    host:'127.0.0.1'
});


const audioCodec = {
				kind        : 'audio',
				name        : 'audio/OPUS',
                payloadType : 100,
				clockRate   : 48000,
                numChannels : 2,
			};


const videoCodec = 
			{
				kind        : 'video',
				name        : 'video/VP8',
				payloadType : 110,
				clockRate   : 90000
			};


let stream;

async function testMKVStream()
{

    let streamId = randomstring.generate();

    debug('create streamId ', streamId);

    stream = await recorder.create(streamId, OutputTypes.MKV);

    await stream.enableVideo(videoCodec);
    await stream.enableAudio(audioCodec);


    let videoout = 'rtp://' + stream.host + ':' + stream.videoport;
    let audioout = 'rtp://' + stream.host + ':' + stream.audioport;

    debug('video out ',videoout);

    debug('audio out ',audioout);

    ffmpeg('./vp8opus.webm').native()
        .output(videoout)
        .outputOptions([
            '-vcodec copy',
            '-an',
            '-f rtp',
            '-payload_type 110'
            ])
        .output(audioout)
        .outputOptions([
            '-acodec copy',
            '-vn',
            '-f rtp',
            '-payload_type 100'
        ])
        .on('start', function(command) {
            debug('Spawned Ffmpeg with command: ' + command);

            let recordId = randomstring.generate(); 
            stream.startRecording();
        })
        .on('error', function(err){
            debug('An error occurred: ' + err);
        })
        .on('stderr',function(stderrLine){
            debug(stderrLine);
        })
        .on('progress', function(progress) {
            //debug('Processing: frames' + progress.frames + ' currentKbps ' + progress.currentKbps);
        })
        .on('end',function(){
            debug('Processing finished !');
        })
        .run();

}



debug('before start');

testMKVStream();








