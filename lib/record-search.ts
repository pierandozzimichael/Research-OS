export type SearchableResearchRecord={
  id:string;type:string;status:string;title:string;summary:string;body:string;
  fields:Record<string,unknown>;urls?:string[];links?:string[];
};

export function scoreRecordSearch(record:SearchableResearchRecord,query:string){
  const rawTerms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(!rawTerms.length)return 1;
  const filters=rawTerms.filter(term=>term.includes(":"));
  const terms=rawTerms.filter(term=>!term.includes(":"));
  for(const filter of filters){
    const [key,...valueParts]=filter.split(":"),value=valueParts.join(":");
    if(!value)continue;
    if(key==="type"&&!record.type.toLowerCase().includes(value))return 0;
    if(key==="status"&&!record.status.toLowerCase().includes(value))return 0;
    if(key==="id"&&!record.id.toLowerCase().includes(value))return 0;
    if(key==="has"&&value==="source"&&!record.urls?.length)return 0;
    if(key==="has"&&value==="links"&&!record.links?.length)return 0;
  }
  if(!terms.length)return 1;
  const phrase=terms.join(" ");
  const id=record.id.toLowerCase(),title=record.title.toLowerCase(),summary=record.summary.toLowerCase();
  const fields=JSON.stringify(record.fields).toLowerCase(),body=record.body.toLowerCase();
  let score=id===phrase?100:0;
  if(title.includes(phrase))score+=30;
  if(summary.includes(phrase))score+=16;
  for(const term of [...new Set(terms)]){
    if(id.includes(term))score+=20;
    if(title.includes(term))score+=10;
    if(summary.includes(term))score+=5;
    if(fields.includes(term))score+=2;
    if(body.includes(term))score+=1;
  }
  return score;
}

export function matchesRecordSearch(record:SearchableResearchRecord,query:string){
  return scoreRecordSearch(record,query)>0;
}
