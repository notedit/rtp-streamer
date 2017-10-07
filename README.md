# rtprecorder
nodejs rtp recorder

it is used to record webrtc stream.

the file is save to .mkv file.

## fetures

- save to mkv file
- rtmp out  


## install 


```

npm install rtprecorder

```


## demo code

```


let videoCodec =
        {
        kind        : 'audio',
        name        : 'audio/opus',
        payloadType : 100,
        clockRate   : 48000
        };

let audioCodec =  
        {
        kind        : 'video',
        name        : 'video/vp8',
        payloadType : 110,
        clockRate   : 90000
        };



let streamId = 'some streamId';

let stream =  recorder.create(streamId, OutputTypes.MKV);

await stream.enableVideo(videoCodec);
await stream.enableAudio(audioCodec);

//  some  audio/video port forward


// after port forwarding  now we can record 


stream.startRecording();
```
