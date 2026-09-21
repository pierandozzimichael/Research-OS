export async function requestMicrophonePermission(){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("This browser does not support microphone capture");
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
  stream.getTracks().forEach(track=>track.stop());
}

export class LocalVoiceCapture {
  private stream?:MediaStream;
  private context?:AudioContext;
  private source?:MediaStreamAudioSourceNode;
  private processor?:ScriptProcessorNode;
  private chunks:Float32Array[]=[];
  private sampleRate=48_000;

  async start(){
    this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
    this.context=new AudioContext();this.sampleRate=this.context.sampleRate;
    this.source=this.context.createMediaStreamSource(this.stream);
    this.processor=this.context.createScriptProcessor(4096,1,1);
    this.processor.onaudioprocess=event=>this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    this.source.connect(this.processor);this.processor.connect(this.context.destination);
  }

  async stop(){
    this.processor?.disconnect();this.source?.disconnect();this.stream?.getTracks().forEach(track=>track.stop());
    await this.context?.close();
    const length=this.chunks.reduce((sum,chunk)=>sum+chunk.length,0),samples=new Float32Array(length);
    let offset=0;for(const chunk of this.chunks){samples.set(chunk,offset);offset+=chunk.length;}
    this.chunks=[];
    return encodeWav(downsample(samples,this.sampleRate,16_000),16_000);
  }

  discard(){
    this.processor?.disconnect();this.source?.disconnect();this.stream?.getTracks().forEach(track=>track.stop());
    void this.context?.close();this.chunks=[];
  }
}

function downsample(input:Float32Array,inputRate:number,outputRate:number){
  if(inputRate===outputRate)return input;
  const ratio=inputRate/outputRate,result=new Float32Array(Math.floor(input.length/ratio));
  for(let index=0;index<result.length;index++){
    const start=Math.floor(index*ratio),end=Math.min(input.length,Math.floor((index+1)*ratio));
    let sum=0;for(let cursor=start;cursor<end;cursor++)sum+=input[cursor];
    result[index]=sum/Math.max(1,end-start);
  }
  return result;
}

function encodeWav(samples:Float32Array,sampleRate:number){
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const text=(offset:number,value:string)=>{for(let index=0;index<value.length;index++)view.setUint8(offset+index,value.charCodeAt(index));};
  text(0,"RIFF");view.setUint32(4,36+samples.length*2,true);text(8,"WAVE");text(12,"fmt ");view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,samples.length*2,true);
  for(let index=0;index<samples.length;index++){const sample=Math.max(-1,Math.min(1,samples[index]));view.setInt16(44+index*2,sample<0?sample*0x8000:sample*0x7fff,true);}
  return new Blob([buffer],{type:"audio/wav"});
}
