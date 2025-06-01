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

  @ViewChild('engines') engineList: EngineListComponent
  @ViewChildren('bpmn_diagrams') bpmnDiagrams: BpmnComponent[]
  @ViewChildren('aggregated_bpmn_diagrams') aggregatedBpmnDiagrams: AggregatedBpmnComponent[]

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
      }
    }
    else if (engines != undefined) {
      this.snackBar.open(`The requested Process Instance not found!`, "Hide", { duration: 2000 });
      this.isResult = false
    }

    if (deleteResult) {
      if (deleteResult == "ok") {
        this.snackBar.open(`The process has been deleted`, "Hide", { duration: 2000 });
        this.currentBpmnJob = undefined
        this.isResult = false
        this._disconnectCurrentJob()
      }
      else {
        this.isResult = false
      }
    }
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
      }, 1000);
    }
  }

  switchToAggregationView() {
    this.viewMode = 'aggregation'

    // Clean up current job connection
    this._disconnectCurrentJob()

    // Clear instance-specific data
    this.diagramPerspectives = []
    this.diagramOverlays = []
    this.currentProcessId = ''
    this.currentProcessType = ''
    this.currentBpmnJob = undefined
    this.isResult = false

    // Request aggregation data
    this.requestAvailableAggregations()
  }

  onAggregationSelected(processType: string) {
    this.currentProcessType = processType
    
    // Find and connect to the aggregation job
    const aggregationJob = this.getAggregationForProcessType(processType)
    if (aggregationJob) {
      this.currentAggregationJob = aggregationJob
      this._connectToJob(aggregationJob)
      console.log('Connected to aggregation job:', aggregationJob.job_id)
    } else {
      console.warn('No aggregation job found for process type:', processType)
    }
    
    // Request initial data via HTTP
    this.requestAggregationData(processType)
  }

  switchToInstanceView() {
    this.viewMode = 'instance'
    this.isResult = false

    // Clean up current job connection
    this._disconnectCurrentJob()

    // Clear aggregation-specific data
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
        }
      }
    });
  }

  onSearch(instance_id: any) {
    this.snackBar.dismiss()
    this.currentProcessId = instance_id
    this.viewMode = 'instance' // Ensure instance mode
    this.requestProcessData()

    // Clean up any existing connection
    this._disconnectCurrentJob()
    this.diagramPerspectives = []
    this.currentBpmnJob = undefined
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
        context.applyOverlaysToGraphics();
      }, 1000);
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

  private _connectToJob(job: any) {
    if (!job) {
      console.warn('No job provided for connection')
      return
    }
    
    console.log('Connecting to job:', job.job_id, 'at', job.host + ':' + job.port)
    
    // Disconnect any existing connection first
    this._disconnectCurrentJob()
    
    // Connect to the job's WebSocket
    this.aggregator.connect(job.host, job.port)
    
    // Subscribe to job events
    this.realtimeJobSubscription = this.aggregator.getEventEmitter().subscribe((data) => {
      this._handleJobUpdate(data)
    })
    
    // Subscribe to the specific job
    this.aggregator.subscribeJob(job.job_id)
  }

  private _disconnectCurrentJob() {
    if (this.realtimeJobSubscription) {
      console.log('Disconnecting from current job')
      this.realtimeJobSubscription.unsubscribe()
      this.realtimeJobSubscription = null
    }
    
    // Only disconnect if we have an active connection
    if (this.aggregator && this.aggregator.isConnected()) {
      this.aggregator.disconnect()
    }
  }

  private _handleJobUpdate(data: any) {
    console.log('Received job update:', data)
    
    // Handle perspective updates
    if (data['update']?.['perspectives'] != undefined) {
      if (this.diagramPerspectives.length != 0) {
        // If we already have perspectives, use timeout to avoid rapid updates
        if (this.updateTimeout != undefined) {
          clearTimeout(this.updateTimeout)
          this.updateTimeout = undefined
        }
        var context = this
        this.updateTimeout = setTimeout(function () {
          context.diagramPerspectives = data['update']['perspectives'] as ProcessPerspective[]
          context.updateTimeout = undefined
          console.log('Updated perspectives (delayed):', context.diagramPerspectives.length)
        }, 1000);
      } else {
        this.diagramPerspectives = data['update']['perspectives'] as ProcessPerspective[]
        console.log('Updated perspectives (immediate):', this.diagramPerspectives.length)
      }
    }
    
    // Handle overlay updates
    if (data['update']?.['overlays'] != undefined) {
      this.diagramOverlays = data['update']['overlays'] as BpmnBlockOverlayReport[]
      console.log('Updated overlays:', this.diagramOverlays.length)
      
      // Apply overlays immediately for overlays
      setTimeout(() => {
        this.applyOverlaysToGraphics()
      }, 100)
    }
    
    // Aggregation-specific data
    if (this.viewMode === 'aggregation' && data['update']?.['summary'] != undefined) {
      this.aggregationSummary = data['update']['summary']
      console.log('Updated aggregation summary:', this.aggregationSummary)
    }
  }
}