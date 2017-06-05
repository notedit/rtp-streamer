# rtprecorder
nodejs  rtp  recorder



a rtp recorder  use ffmpeg.



## todo

- snapshot


## some article

-  http://www.bogotobogo.com/FFMpeg/ffmpeg_thumbnails_select_scene_iframe.php
-  http://www.bugcodemaster.com/article/extract-images-frame-frame-video-file-using-ffmpeg



```

let codecs = [{
        kind        : 'audio',
        name        : 'audio/opus',
        payloadType : 100,
        clockRate   : 48000
        },
        {
        kind        : 'video',
        name        : 'video/vp8',
        payloadType : 110,
        clockRate   : 90000
        }];


let stream = rtprecorder.create('streamId',codecs);


//  some  audio/video port forward


// after port forwarding  now we can record 


stream.startRecording();


```
