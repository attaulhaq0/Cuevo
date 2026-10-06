import test from'node:test';import assert from'node:assert/strict';import{demoRevealScroll}from'../demo-guide-scroll.ts';
const viewport={height:900,scrollY:300,headerBottom:130,panelTop:670};
test('a currently visible scene does not move the presenter viewport',()=>{assert.equal(demoRevealScroll({top:200,bottom:550,height:350},viewport),null);});
test('large already aligned reading area is not centred beyond its heading',()=>{assert.equal(demoRevealScroll({top:144,bottom:850,height:706},viewport),null);assert.equal(demoRevealScroll({top:400,bottom:1200,height:800},viewport),556);});
test('a hidden or covered scene aligns its start under current navigation without smooth motion',()=>{assert.equal(demoRevealScroll({top:30,bottom:400,height:370},viewport),186);assert.equal(demoRevealScroll({top:700,bottom:950,height:250},viewport),856);});
