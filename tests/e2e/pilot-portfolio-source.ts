/** A setup receipt selects the volume source; rendered ordering cannot choose it. */
export function pilotPortfolioSource(scope:{lastPortfolioId:string;records:{kind:string;id:string}[];actual:{portfolios:number}}):{id:string;title:string}{
 const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
 const records=scope.records.filter(row=>row.kind==='PORTFOLIO');
 if(!uuid.test(scope.lastPortfolioId)||records.length!==scope.actual.portfolios||records.filter(row=>row.id===scope.lastPortfolioId).length!==1||records.at(-1)?.id!==scope.lastPortfolioId||!Number.isSafeInteger(scope.actual.portfolios)||scope.actual.portfolios<1)throw Error('Exact committed pilot Portfolio source receipt required.');
 return{id:scope.lastPortfolioId,title:`Browser pilot volume selected work ${String(records.length).padStart(3,'0')}`};
}
