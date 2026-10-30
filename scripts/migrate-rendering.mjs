import fs from 'node:fs';
import path from 'node:path';
import {parse} from '@babel/parser';
import traverseImport from '@babel/traverse';
import generateImport from '@babel/generator';
import * as t from '@babel/types';
const traverse=traverseImport.default||traverseImport,generate=generateImport.default||generateImport;
for(const name of fs.readdirSync('baseline/dist').filter(n=>/\.(js|mjs)$/.test(n))){
 const original=fs.readFileSync('baseline/dist/'+name,'utf8');
 const ast=parse(original,{sourceType:'module'});let changed=false;
 traverse(ast,{
  AssignmentExpression(p){const l=p.node.left;if(!t.isMemberExpression(l)||l.computed||!['innerHTML','outerHTML'].includes(l.property.name))return;
   if(p.node.operator!=='=')throw Error('Unsupported assignment');
   p.replaceWith(t.callExpression(t.identifier(l.property.name==='innerHTML'?'renderRegion':'replaceRegion'),[l.object,p.node.right]));changed=true;},
  CallExpression(p){const c=p.node.callee;if(!t.isMemberExpression(c)||c.computed||!t.isIdentifier(c.property,{name:'insertAdjacentHTML'}))return;p.replaceWith(t.callExpression(t.identifier('insertRegion'),[c.object,...p.node.arguments]));changed=true;}
 });
 if(changed)ast.program.body.unshift(t.importDeclaration(['renderRegion','replaceRegion','insertRegion'].map(n=>t.importSpecifier(t.identifier(n),t.identifier(n))),t.stringLiteral('../react/regions')));
 fs.writeFileSync(path.join('src/features',name),generate(ast,{comments:true}).code+'\n');
}
