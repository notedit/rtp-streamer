# rtpstreamer
nodejs rtp streamer

it is used to record webrtc stream.

the file is save to .mkv file.

## fetures

- save to mkv file
- stream to rtmp 

## install 


```

npm install rtprecorder

```


## demo code

```


let audioCodec =
        {
        kind        : 'audio',
        name        : 'audio/opus',
        payloadType : 100,
        clockRate   : 48000
        };

let videoCodec =  
        {
        kind        : 'video',
        name        : 'video/vp8',
        payloadType : 110,
        clockRate   : 90000
        };



let streamId = 'some streamId';

let stream =  recorder.create(streamId);

await stream.enableVideo(videoCodec);
await stream.enableAudio(audioCodec);

//  some  audio/video port forward

// after port forwarding  now we can record 

stream.startRecording();
```
