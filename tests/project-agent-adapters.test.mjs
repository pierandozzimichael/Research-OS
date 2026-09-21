import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {spawn} from "node:child_process";
import path from "node:path";

const root=process.cwd();

test("project agent adapters use the checked-in Research OS server",async()=>{
  const claude=JSON.parse(await readFile(path.join(root,".mcp.json"),"utf8"));
  assert.equal(claude.mcpServers["research-os"].type,"stdio");
  assert.equal(claude.mcpServers["research-os"].command,"powershell.exe");
  assert.equal(claude.mcpServers["research-os"].args.at(-1),"${CLAUDE_PROJECT_DIR}/scripts/run-research-mcp.ps1");

  const codex=await readFile(path.join(root,".codex","config.toml"),"utf8");
  assert.match(codex,/\[mcp_servers\.research_os\]/);
  assert.match(codex,/scripts\/run-research-mcp\.ps1/);
  assert.match(codex,/default_tools_approval_mode = "writes"/);
});

test("Research OS skill is concise and routes to canonical policy",async()=>{
  const skill=await readFile(path.join(root,".agents","skills","research-os","SKILL.md"),"utf8");
  assert.match(skill,/^---\r?\nname: research-os\r?\n/);
  assert.match(skill,/START_HERE\.md/);
  assert.match(skill,/AGENTS\.md/);
  assert.match(skill,/99 Templates/);
  assert.match(skill,/Never assert human review/);
  assert.match(skill,/research_show_in_workspace/);
  assert.match(skill,/embedded browser/);
  assert.ok(skill.length<6000,"The project skill should remain a compact router.");
});

test("local launchers are portable across Windows user directories",async()=>{
  const [command,development,mcp]=await Promise.all([
    readFile(path.join(root,"scripts","run-dev-server.cmd"),"utf8"),
    readFile(path.join(root,"scripts","run-dev-server.ps1"),"utf8"),
    readFile(path.join(root,"scripts","run-research-mcp.ps1"),"utf8"),
  ]);
  for(const source of [command,development,mcp])assert.doesNotMatch(source,/C:\\Users\\Mikey/i);
  assert.match(command,/%~dp0run-dev-server\.ps1/);
  assert.match(development,/\$projectRoot/);
  assert.match(development,/22\.13\.0/);
  assert.match(mcp,/22\.13\.0/);
});

test("MCP server finds the workspace when launched outside the repository",async()=>{
  const launcher=path.join(root,"scripts","run-research-mcp.ps1");
  const child=spawn("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-File",launcher],{cwd:path.join(root,"tests"),stdio:["pipe","pipe","pipe"]});
  let stdout="",stderr="";
  child.stdout.on("data",chunk=>{stdout+=chunk.toString("utf8");});
  child.stderr.on("data",chunk=>{stderr+=chunk.toString("utf8");});
  child.stdin.write(`${JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-11-25",capabilities:{}}})}\n`);
  child.stdin.write(`${JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"research_brief",arguments:{}}})}\n`);
  child.stdin.end();
  await new Promise((resolve,reject)=>{
    child.on("error",reject);
    child.on("close",code=>code===0?resolve():reject(new Error(`MCP server exited ${code}: ${stderr}`)));
  });
  const messages=stdout.trim().split("\n").map(line=>JSON.parse(line));
  assert.equal(messages[0].result.serverInfo.name,"research-os");
  assert.equal(messages[1].result.isError,false);
  assert.equal(messages[1].result.structuredContent.tool,"project.brief");
});
