/** Test-only scope: runner timeouts do not cancel promises or PostgreSQL handlers. */
export class CooperativeFixtureScope {
  private cancelled=false;
  private readonly deadline:number;
  private body:Promise<unknown>|undefined;
  constructor(budgetMs:number,private readonly now:()=>number=()=>performance.now()){this.deadline=now()+budgetMs;}
  private requireActive(){if(this.cancelled||this.now()>=this.deadline)throw new Error('Fixture case deadline or cancellation requires cleanup.');}
  async operation<T>(work:()=>PromiseLike<T>):Promise<T>{this.requireActive();const result=await work();this.requireActive();return result;}
  run<T>(work:()=>Promise<T>):Promise<T>{if(this.body)throw new Error('Fixture scope already owns a body.');this.requireActive();const body=Promise.resolve().then(()=>{this.requireActive();return work();});this.body=body;return body;}
  async cancelAndWait(){this.cancelled=true;if(this.body)await Promise.allSettled([this.body]);}
}
