'use strict'

const streamer = require('./rtpstreamer');

module.exports = 
{
    RTMPStreamer:streamer.RTMPStreamer,
    RecordStreamer:streamer.RecordStreamer,
    getMediaPort:streamer.getMediaPort
};