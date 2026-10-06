import{test,expect}from'@playwright/test';import{pilotPortfolioSource}from'./pilot-portfolio-source';
test('pilot Portfolio selection uses the independent exact setup receipt and fixed authored source title',()=>{
 const id='eb000000-0000-4000-8000-000000000001',scope={lastPortfolioId:id,records:[{kind:'PORTFOLIO',id}],actual:{portfolios:1}};expect(pilotPortfolioSource(scope)).toEqual({id,title:'Browser pilot volume selected work 001'});
 for(const invalid of[{...scope,lastPortfolioId:'current DOM last row'},{...scope,records:[]},{...scope,records:[{kind:'RESULT',id}]},{...scope,records:[...scope.records,...scope.records]},{...scope,lastPortfolioId:'eb000000-0000-4000-8000-000000000002'}])expect(()=>pilotPortfolioSource(invalid)).toThrow();
});
