#!/usr/bin/env node
/**
 * Test DRITTFOLK-prompt på Gemma3, Llama3.1, og Mistral
 * Sammenligner kvalitet på norske fornærmelser
 */

import { spawn } from 'child_process';
import fs from 'fs';

const PROMPT = `Du skriver korte fornærmelser for kunstinstallasjonen DRITTFOLK.
Tone: Træt likegyldighet — ikke sint, bare uinteressert.

EKSEMPLER PÅ RIKTIG STIL:
- Du er typen folk husker feil navn på.
- Støvet under sofaen har mer personlighet enn deg.
- Du er som et møte som kunne vært en epost.
- Du smaker som et valg jeg angrer på.
- Dopapir har mer personlighet enn deg.
- Du minner om en notifikasjon jeg avviste.
- Du lukter som en våt sokk.

REGLER:
- Maks 12 ord. Kortere = bedre.
- Hverdagslig og konkret (møter, podcaster, kvitteringer, etc.)
- Aldri sint — alltid sliten og overlegen.
- Ingen referanser til kropp/familie/etnisitet.
- Noe HELT NYTT, ikke varier eksemplene.

Skriv EN fornærmelse i samme stil. Svar BARE med fornærmelsen.`;

const MODELS = ['gemma3:12b', 'llama3.1:8b', 'mistral'];

async function testModel(model) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn('ollama', ['run', model, PROMPT]);
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', () => {
      const time = Date.now() - start;
      const insult = output.trim().split('\n')[0]; // Første linje
      resolve({
        model,
        insult,
        time,
        words: insult.split(' ').length
      });
    });
  });
}

async function runTests() {
  console.log('🧪 DRITTFOLK Model Testing\n');
  console.log('═'.repeat(60));
  
  const results = [];
  
  for (const model of MODELS) {
    console.log(`\nTesting ${model}...`);
    try {
      const result = await testModel(model);
      results.push(result);
      
      console.log(`✅ ${model}`);
      console.log(`   Fornærmelse: "${result.insult}"`);
      console.log(`   Ord: ${result.words} | Tid: ${result.time}ms`);
    } catch (err) {
      console.log(`❌ ${model} feilet`);
    }
  }
  
  // Sammenligning
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 SAMMENLIGNING:\n');
  
  results.sort((a, b) => a.time - b.time);
  results.forEach((r, i) => {
    const speed = i === 0 ? '⚡ Raskest' : '';
    console.log(`${r.model.padEnd(15)} | ${r.time}ms ${speed}`);
  });
  
  // Lagre til fil
  const resultsFile = '/Users/tormartin/drittfolk/test-results.json';
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n✅ Resultater lagret: ${resultsFile}`);
}

runTests().catch(console.error);
