# rtprecorder
nodejs rtp recorder

it is used to record webrtc stream.

the file is save to .mkv file.

## todo

- snapshot


## demo code

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


let streamId = 'some streamId';
let stream = await rtprecorder.create(streamId,codecs);


//  some  audio/video port forward


// after port forwarding  now we can record 

let recordId = 'recordId';

stream.startRecording(recordId);
```
