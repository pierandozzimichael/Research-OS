import assert from "node:assert/strict";
import test from "node:test";
import {transcribeLocalWav} from "../lib/local-voice.ts";

function wav(seconds:number){
  const sampleRate=16_000,dataBytes=Math.floor(seconds*sampleRate*2),bytes=Buffer.alloc(44+dataBytes);
  bytes.write("RIFF",0);bytes.writeUInt32LE(36+dataBytes,4);bytes.write("WAVE",8);bytes.write("fmt ",12);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write("data",36);bytes.writeUInt32LE(dataBytes,40);
  return bytes;
}

test("local voice rejects non-WAV input before contacting a transcription service",async()=>{
  await assert.rejects(transcribeLocalWav(Buffer.from("not audio")),/WAV recording/i);
});

test("local voice enforces the 30-second recording boundary",async()=>{
  await assert.rejects(transcribeLocalWav(wav(31)),/30 seconds/i);
});
