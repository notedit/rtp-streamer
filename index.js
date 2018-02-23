'use strict'

const recorder = require('./rtprecorder');


module.exports = 
{
    Stream:recorder.Stream,
    RtpRecorder:recorder.RtpRecorder
};