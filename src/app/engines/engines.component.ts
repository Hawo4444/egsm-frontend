import { Component, ViewChild, ViewChildren } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AggregatorConnector } from '../AggregatorConnector';
import { BpmnComponent } from '../bpmn/bpmn.component';
import { AggregatedBpmnComponent } from '../bpmn/aggregated-bpmn.component';
import { DeleteProcessDialogComponent } from '../delete-process-dialog/delete-process-dialog.component';
import { EngineListComponent } from '../engine-list/engine-list.component';
import { LoadingService } from '../loading.service';
import { BpmnBlockOverlayReport, ProcessPerspective } from '../primitives/primitives';
import { SupervisorService } from '../supervisor.service';

const MODULE_STORAGE_KEY = 'process_operation'

interface AggregationJob {
  job_id: string;
  job_type: string;
  process_type: string;
  perspectives: string[];
  host: string;
  port: number;
}

@Component({
  selector: 'app-engines',
  templateUrl: './engines.component.html',
  styleUrls: ['./engines.component.scss']
})
export class EnginesComponent {
  // HTTP-based subscriptions for initial setup
  instanceHttpSubscription: any
  aggregationHttpSubscription: any

  // WebSocket-based subscription for real-time updates
  realtimeJobSubscription: any

  currentProcessType: string
  currentProcessId: string
  currentBpmnJob: any = undefined
  currentAggregationJob: any = undefined

  diagramPerspectives: ProcessPerspective[] = []
  diagramOverlays: BpmnBlockOverlayReport[] = []

  aggregator: AggregatorConnector = new AggregatorConnector()

  isResult: boolean = false
  viewMode: 'instance' | 'aggregation' = 'instance'
  availableAggregations: AggregationJob[] = []
  aggregationSummary: any = undefined

  selectedTabIndex = 0;
  private updateTimeout: any = undefined
  private overlayApplicationInProgress = false;

  @ViewChild('engines') engineList: EngineListComponent
  @ViewChildren('bpmn_diagrams') bpmnDiagrams: BpmnComponent[]
  @ViewChildren('aggregated_bpmn_diagrams') aggregatedBpmnDiagrams: AggregatedBpmnComponent[]

  currentLegendData: any[] = [];

  constructor(private supervisorService: SupervisorService, private snackBar: MatSnackBar, private loadingService: LoadingService, public deleteProcessDialog: MatDialog) {
    this.instanceHttpSubscription = this.supervisorService.ProcessSearchEventEmitter.subscribe((update: any) => {
      this.applyUpdate(update)
    })

    this.aggregationHttpSubscription = this.supervisorService.AggregatorEventEmitter.subscribe((update: any) => {
      this.applyAggregatorUpdate(update)
    })
  }

  ngOnDestroy() {
    this.instanceHttpSubscription?.unsubscribe()
    this.aggregationHttpSubscription?.unsubscribe()
    this._disconnectCurrentJob()

    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout)
    }
  }

  applyUpdate(update: any) {
    this.loadingService.setLoadningState(false)
    var engines = update['engines'] || undefined
    var deleteResult = update['delete_result'] || undefined

    if (engines != undefined && engines.length > 0) {
      if (this.engineList) {
        this.engineList.update(update['engines'])
      } else {
        console.warn('EngineList not initialized yet, deferring update');
        setTimeout(() => {
          if (this.engineList) {
            this.engineList.update(update['engines'])
          }
        }, 100);
      }

      this.isResult = true
      this.currentProcessType = update['engines'][0].type

      if (update['bpmn_job'] != 'not_found') {
        this.currentBpmnJob = update['bpmn_job']
        this._connectToJob(this.currentBpmnJob)
      } else {
        this.currentBpmnJob = undefined
      }
    }
    else if (engines != undefined) {
      this.snackBar.open(`The requested Process Instance not found!`, "Hide", { duration: 2000 });
      this.isResult = false
      this.currentBpmnJob = undefined
    }

    if (deleteResult) {
      if (deleteResult == "ok") {
        this.snackBar.open(`The process has been deleted`, "Hide", { duration: 2000 });
        this.isResult = false
        this._disconnectCurrentJob()
      }
      else {
        this.isResult = false
      }
    }
  }

  switchToAggregationView() {
    this.viewMode = 'aggregation'

    this.loadingService.setLoadningState(true)
    this._disconnectCurrentJob()
    this.clearAllCumulativeData()

    this.diagramPerspectives = []
    this.diagramOverlays = []
    this.currentProcessId = ''
    this.currentProcessType = ''
    this.currentBpmnJob = undefined
    this.aggregationSummary = undefined

    // Small delay to ensure cleanup is complete before requesting new data
    setTimeout(() => {
      this.requestAvailableAggregations()
    }, 100)
  }

  onAggregationSelected(processType: string) {
    this.currentProcessType = processType

    const aggregationJob = this.getAggregationForProcessType(processType)
    if (aggregationJob) {
      this.currentAggregationJob = aggregationJob
      this._connectToJob(aggregationJob)
    } else {
      console.warn('No aggregation job found for process type:', processType)
    }

    this.requestAggregationData(processType)
  }

  applyAggregatorUpdate(update: any) {
    this.loadingService.setLoadningState(false)

    if (update['type'] == 'available_aggregations') {
      this.availableAggregations = update['available_aggregations'].map((agg: any) => ({
        job_id: agg.id,
        job_type: agg.job_type,
        process_type: agg.processType,
        perspectives: agg.perspectives,
        host: agg.brokers[0]?.host || '',
        port: agg.brokers[0]?.port || 0
      }));
      this.isResult = true
    }

    if (update['complete_aggregation_data']) {
      const data = update['complete_aggregation_data'];
      this.diagramPerspectives = data.perspectives || [];
      this.diagramOverlays = data.overlays || [];
      this.aggregationSummary = data.summary || {};
      this.isResult = true

      setTimeout(() => {
        this.applyOverlaysToGraphics();
      }, 500);
    }
  }

  switchToInstanceView() {
    this.viewMode = 'instance'
    this.isResult = false

    this._disconnectCurrentJob()

    this.clearAllCumulativeData()

    this.diagramPerspectives = []
    this.diagramOverlays = []
    this.aggregationSummary = undefined
    this.availableAggregations = []
    this.currentProcessType = ''
    this.currentProcessId = ''
    this.currentAggregationJob = undefined
  }

  requestAvailableAggregations() {
    this.loadingService.setLoadningState(true)
    this.supervisorService.requestUpdate('aggregators', { request_type: 'available_aggregations' })
  }

  requestAggregationData(processType: string) {
    this.loadingService.setLoadningState(true)
    const payload = {
      request_type: 'complete_aggregation_data',
      process_type: processType
    };
    this.supervisorService.requestUpdate('aggregators', payload);
  }

  getAggregationForProcessType(processType: string): AggregationJob | undefined {
    return this.availableAggregations.find(agg => agg.process_type === processType)
  }

  applyOverlaysToGraphics() {
    if (this.overlayApplicationInProgress) {
      return;
    }

    this.overlayApplicationInProgress = true;

    let aggregatedDiagramsUpdated = new Set<AggregatedBpmnComponent>();

    this.diagramOverlays.forEach(overlay => {
      if (this.viewMode === 'instance') {
        var diagram = this.bpmnDiagrams.find(element => element.model_id == overlay.perspective)
        if (diagram) {
          diagram.applyOverlayReport([overlay])
        }
      } else if (this.viewMode === 'aggregation') {
        var aggregatedDiagram = this.aggregatedBpmnDiagrams.find(element => element.model_id == overlay.perspective)
        if (aggregatedDiagram) {
          aggregatedDiagram.applyAggregatedOverlayReport([overlay])
          aggregatedDiagramsUpdated.add(aggregatedDiagram);
        }
      }
    });

    if (this.viewMode === 'aggregation' && aggregatedDiagramsUpdated.size > 0) {
      const firstDiagram = Array.from(aggregatedDiagramsUpdated)[0];
      setTimeout(() => {
        const legendData = firstDiagram.generateLegendData();
        this.currentLegendData = legendData;
        this.overlayApplicationInProgress = false;
      }, 100);
    } else {
      this.overlayApplicationInProgress = false;
    }
  }

  onSearch(instance_id: any) {
    this.snackBar.dismiss()
    this.currentProcessId = instance_id
    this.viewMode = 'instance'

    // Disconnect if we're switching between different instances or view modes
    if (this.currentBpmnJob || this.currentAggregationJob) {
      this._disconnectCurrentJob()
    }

    this.clearAllCumulativeData()

    this.diagramPerspectives = []
    this.diagramOverlays = []
    this.isResult = false

    // Request new process data
    this.requestProcessData()
  }

  onDeleteProcess() {
    if (!this.currentProcessId) {
      console.warn('Cannot initiate process termination! Instance ID is undefined')
      return
    }
    const dialogRef = this.deleteProcessDialog.open(DeleteProcessDialogComponent,
      {
        width: '500px',
        data: {
          processId: this.currentProcessId,
        }
      });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.requestProcessDelete()
      }
    })
  }

  onDiagramEvent(event: string) {
    if (event == 'INIT_DONE') {
      var context = this
      setTimeout(function () {
        if (context.diagramOverlays.length > 0 && !context.overlayApplicationInProgress) {
          context.applyOverlaysToGraphics();
        }
      }, 300);
    }
  }

  requestProcessDelete() {
    this.loadingService.setLoadningState(true)
    var payload = {
      process_type: this.currentProcessType,
      process_instance_id: this.currentProcessId
    }
    this.supervisorService.sendCommand(MODULE_STORAGE_KEY, payload)
  }

  requestProcessData() {
    this.loadingService.setLoadningState(true)
    var payload = {
      process_instance_id: this.currentProcessId
    }
    this.supervisorService.requestUpdate(MODULE_STORAGE_KEY, payload)
  }

  selectTab(index: number) {
    this.selectedTabIndex = index;

    const tabPanels = document.querySelectorAll('.tab-panel');
    const tabHeaders = document.querySelectorAll('.tab-header');

    tabPanels.forEach((panel, i) => {
      (panel as HTMLElement).style.display = i === index ? 'block' : 'none';
    });

    tabHeaders.forEach((header, i) => {
      if (i === index) {
        header.classList.add('active');
      } else {
        header.classList.remove('active');
      }
    });
  }

  onLegendDataChanged(legendData: any[]) {
    this.currentLegendData = legendData;
  }

  private _connectToJob(job: any) {
    if (!job) {
      console.warn('No job provided for connection')
      return
    }

    if (this.realtimeJobSubscription) {
      this.realtimeJobSubscription.unsubscribe()
      this.realtimeJobSubscription = null
    }
    if (this.aggregator && this.aggregator.isConnected()) {
      this.aggregator.disconnect()
    }

    this.aggregator.connect(job.host, job.port)

    this.realtimeJobSubscription = this.aggregator.getEventEmitter().subscribe((data) => {
      this._handleJobUpdate(data)
    })

    this.aggregator.subscribeJob(job.job_id)
  }

  private _disconnectCurrentJob() {
    const bpmnJobId = this.currentBpmnJob?.job_id
    const aggregationJobId = this.currentAggregationJob?.job_id

    if (bpmnJobId) {
      this.aggregator.unsubscribeJob(bpmnJobId)
    }
    if (aggregationJobId) {
      this.aggregator.unsubscribeJob(aggregationJobId)
    }

    if (this.realtimeJobSubscription) {
      this.realtimeJobSubscription.unsubscribe()
      this.realtimeJobSubscription = null
    }

    if (this.aggregator && this.aggregator.isConnected()) {
      this.aggregator.disconnect()
    }

    this.currentBpmnJob = undefined
    this.currentAggregationJob = undefined
  }

  private _handleJobUpdate(data: any) {
    const jobId = data['update']?.['job_id'] || data['job_id']
    let shouldProcess = false

    if (this.viewMode === 'instance') {
      shouldProcess = this.currentBpmnJob?.job_id === jobId
    } else if (this.viewMode === 'aggregation') {
      shouldProcess = this.currentAggregationJob?.job_id === jobId
    }

    if (!shouldProcess)
      return

    let perspectiveUpdate = null
    let overlayUpdate = null
    let summaryUpdate = null

    if (data['update']?.['perspectives'] != undefined) {
      perspectiveUpdate = data['update']['perspectives']
    }

    if (data['update']?.['overlays'] != undefined) {
      overlayUpdate = data['update']['overlays']
    }

    if (this.viewMode === 'aggregation' && data['update']?.['summary'] != undefined) {
      summaryUpdate = data['update']['summary']
    }

    if (perspectiveUpdate) {
      this.diagramPerspectives = perspectiveUpdate
    }

    if (summaryUpdate) {
      this.aggregationSummary = summaryUpdate
    }

    if (overlayUpdate) {
      this.diagramOverlays = overlayUpdate
    }

    // Apply overlays to graphics after a short delay to ensure BPMN is ready
    if (overlayUpdate && overlayUpdate.length > 0 && !this.overlayApplicationInProgress) {
      setTimeout(() => {
        this.applyOverlaysToGraphics()
      }, 300)
    }
  }

  selectedAggregationTab = 0;
  aggregationTabs = ['Stage Correlations', 'Deviation Types', 'Instance Analysis'];

  selectAggregationTab(index: number) {
    this.selectedAggregationTab = index;
  }

  getPerspectiveNames(): string[] {
    if (!this.aggregationSummary?.processAggregations) return [];
    return Object.keys(this.aggregationSummary.processAggregations);
  }

  getTopStageCorrelations(perspective: string, limit: number = 5): any[] {
    const processAggs = this.aggregationSummary?.processAggregations;
    if (!processAggs || !processAggs[perspective]) return [];

    const correlations = processAggs[perspective].stageCorrelations || [];
    return correlations.slice(0, limit);
  }

  getDeviationTypesList(perspective: string): any[] {
    const processAggs = this.aggregationSummary?.processAggregations;
    if (!processAggs || !processAggs[perspective]) return [];

    const typeCounts = processAggs[perspective].deviationTypeCounts || {};
    const typePercentages = processAggs[perspective].deviationTypePercentages || {};
    const typeInstances = processAggs[perspective].deviationTypeInstances || {};

    const result: any[] = [];

    Object.keys(typeCounts).forEach(typeName => {
      result.push({
        name: typeName,
        count: typeCounts[typeName] || 0,
        percentage: typePercentages[typeName] || 0,
        instanceCount: (typeInstances[typeName] || []).length
      });
    });

    return result.sort((a, b) => b.count - a.count);
  }

  formatDeviationType(type: string): string {
    return type.toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  getTotalInstanceCount(perspective: string): number {
    const processAggs = this.aggregationSummary?.processAggregations;
    if (!processAggs || !processAggs[perspective]) return 0;

    const instanceCounts = processAggs[perspective].instanceDeviationCounts || {};
    return Object.keys(instanceCounts).length;
  }

  getInstancesWithDeviationsCount(perspective: string): number {
    const processAggs = this.aggregationSummary?.processAggregations;
    if (!processAggs || !processAggs[perspective]) return 0;

    const instanceCounts = processAggs[perspective].instanceDeviationCounts || {};
    return Object.values(instanceCounts).filter((count: any) => count > 0).length;
  }

  getAverageDeviationsPerInstance(perspective: string): string {
    const processAggs = this.aggregationSummary?.processAggregations;
    if (!processAggs || !processAggs[perspective]) return '0.0';

    const instanceCounts = processAggs[perspective].instanceDeviationCounts || {};
    const counts = Object.values(instanceCounts) as number[];

    if (counts.length === 0) return '0.0';

    const total = counts.reduce((sum, count) => sum + count, 0);
    const average = total / counts.length;

    return average.toFixed(1);
  }

  getAllInstancesOrderedByDeviations(perspective: string): any[] {
    const processAggs = this.aggregationSummary?.processAggregations;
    if (!processAggs || !processAggs[perspective]) return [];

    const instanceCounts = processAggs[perspective].instanceDeviationCounts || {};

    const instances = Object.entries(instanceCounts)
      .map(([id, count]) => ({ id, count: count as number }))
      .sort((a, b) => b.count - a.count);

    return instances;
  }

  getInstanceSeverityClass(deviationCount: number): string {
    return deviationCount === 0 ? 'has-no-deviations' : 'has-deviations';
  }

  private clearAllCumulativeData() {
    this.bpmnDiagrams?.forEach(diagram => {
      diagram.clearCumulativeData();
    });
  }
}