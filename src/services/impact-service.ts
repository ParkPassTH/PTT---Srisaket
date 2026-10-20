import type { Repository } from "../repositories/repository.js";
import { deriveStockBalance } from "./stock-service.js";

export class ImpactService {
  constructor(private readonly repository:Repository) {}
  async measure(){
    const [activities,reviews,lots,movements,batches,audits]=await Promise.all([this.repository.listActivities(),this.repository.listAllReviews(),this.repository.listLots(),this.repository.listStockMovements(),this.repository.listImportBatches(),this.repository.listAllAuditEvents()]);
    const missing=activities.filter((x)=>!x.plotId||!x.crop||!x.activityType).length;
    const completedDurations=activities.map((activity)=>{
      const review=reviews.filter((x)=>x.activityId===activity.activityId).sort((a,b)=>b.reviewedAt.localeCompare(a.reviewedAt))[0];
      return review?Date.parse(review.reviewedAt)-Date.parse(activity.receivedAt):NaN;
    }).filter((x)=>Number.isFinite(x)&&x>=0);
    let reconciliationIssues=0;
    for(const lot of lots){ try{ deriveStockBalance(lot.lotId,lot.unit,movements.filter((x)=>x.lotId===lot.lotId)); }catch{ reconciliationIssues++; } }
    const duplicateRows=batches.reduce((sum,x)=>sum+x.duplicateRows,0);
    const errorRows=batches.reduce((sum,x)=>sum+x.errorRows,0);
    return {
      measuredAt:new Date().toISOString(), baseline:null,
      activities:{total:activities.length,missingRequired:missing,pendingReview:activities.filter((x)=>["NEEDS_REVIEW","AWAITING_FARMER","NEEDS_CONFIRMATION"].includes(x.processingStatus)).length,reworkCount:audits.filter((x)=>x.action==="MANUAL_CORRECTION").length,medianReviewMinutes:completedDurations.length?Math.round(median(completedDurations)/60000):null},
      imports:{batches:batches.length,duplicateRows,errorRows},
      inventory:{lots:lots.length,movements:movements.length,reconciliationIssues},
      notes:["ตัวเลขคำนวณจากข้อมูลในระบบ ณ เวลาที่แสดง","ยังไม่มี baseline กระบวนการเดิม จึงยังไม่สรุปเปอร์เซ็นต์การปรับปรุง"]
    };
  }
}
function median(values:number[]){const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]!:(sorted[middle-1]!+sorted[middle]!)/2;}
