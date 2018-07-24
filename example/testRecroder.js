'use strict'


const streamer = require('../index');
const ffmpeg =  require('fluent-ffmpeg');


const debug = require('debug')('debug');



async function testRTMPStream()
{



    let audioCodec = {
                    codec      : 'opus',
                    payload    : 100,
                    rate       : 48000,
                    channels   : 2,
                };


    let videoCodec = {
                    codec       : 'vp8',
                    payload     : 110,
                    rate        : 90000
                };

    let audioPort = await streamer.getMediaPort()
    let videoPort = await streamer.getMediaPort()

    let rtmp = new streamer.RTMPStreamer(
        {
            rtmpURL:'rtmp://localhost/live/live',
            audioPort: audioPort,
            videoPort: videoPort,
            audio: audioCodec,
            video: videoCodec
        }
    )

    rtmp.on('start', (line) => {
        debug('start', line)
    })

    rtmp.on('close', (err) => {
        debug('close ', err)
    })

    let videoout = 'rtp://localhost:' + videoPort;
    let audioout = 'rtp://localhost:' + audioPort;

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

            rtmp.start()

        })
        .on('error', function(err){
            debug('An error occurred: ' + err);
        })
        .on('stderr',function(stderrLine){
            debug(stderrLine);
        })
        .on('progress', function(progress) {
            debug('Processing: frames' + progress.frames + ' currentKbps ' + progress.currentKbps);
        })
        .on('end',function(){
            debug('Processing finished !');
        })
        .run();
};


async function testRecordStream()
{
    
    let audioCodec = {
            codec      : 'opus',
            payload    : 100,
            rate       : 48000,
            channels   : 2,
        };


    let videoCodec = {
            codec       : 'vp8',
            payload     : 110,
            rate        : 90000
        };

    
    let audioPort = await streamer.getMediaPort();
    let videoPort = await streamer.getMediaPort();


    audioPort = 49406;
    videoPort = 49408;

    let mkv = new streamer.RecordStreamer(
        {
            filename: 'test.mkv',
            audioPort: audioPort,
            videoPort: videoPort,
            audio: audioCodec,
            video: videoCodec
        }
    )

    mkv.on('start', (line) => {
        debug('start', line)
    })

    mkv.on('close', (err) => {
        debug('close ', err)
    })

    let videoout = 'rtp://localhost:' + videoPort;
    let audioout = 'rtp://localhost:' + audioPort;

    console.log('video out ',videoout);

    console.log('audio out ',audioout);


    let command = ffmpeg('./vp8opus.webm').native()
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
            mkv.start()
        })
        .on('error', function(err){
            console.log('An error occurred: ' + err);
        })
        .on('stderr',function(stderrLine){
            console.log(stderrLine);
        })
        .on('end',function(){
            console.log('Processing finished !');
            mkv.close();
        })
        .run();

};



debug('before start');

//testRecordStream();

testRTMPStream();








