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
  instanceEventSubscription: any
  instanceAggregatorEventSubscription: any
  typeAggregationEventSubscription: any // New: for aggregation HTTP responses
  typeAggregationModeSubscription: any // New: for aggregation WebSocket updates

  currentProcessType: string
  currentProcessId: string
  currentBpmnJob: any = undefined
  currentAggregationJob: any = undefined

  diagramPerspectives: ProcessPerspective[] = []
  diagramOverlays: BpmnBlockOverlayReport[] = []

  aggregator: AggregatorConnector = new AggregatorConnector()
  aggregationAggregator: AggregatorConnector = new AggregatorConnector() // New: separate aggregator for aggregation mode

  isResult: boolean = false
  viewMode: 'instance' | 'aggregation' = 'instance'
  availableAggregations: AggregationJob[] = []
  aggregationSummary: any = undefined

  selectedTabIndex = 0;

  @ViewChild('engines') engineList: EngineListComponent
  @ViewChildren('bpmn_diagrams') bpmnDiagrams: BpmnComponent[]
  @ViewChildren('aggregated_bpmn_diagrams') aggregatedBpmnDiagrams: AggregatedBpmnComponent[]

  constructor(private supervisorService: SupervisorService, private snackBar: MatSnackBar, private loadingService: LoadingService, public deleteProcessDialog: MatDialog) {
    this.instanceEventSubscription = this.supervisorService.ProcessSearchEventEmitter.subscribe((update: any) => {
      this.applyUpdate(update)
    })

    this.typeAggregationEventSubscription = this.supervisorService.AggregatorEventEmitter.subscribe((update: any) => {
      this.applyAggregatorUpdate(update)
    })
  }

  ngOnDestroy() {
    this.instanceEventSubscription.unsubscribe()
    if (this.currentBpmnJob) {
      this.instanceAggregatorEventSubscription.unsubscribe()
      this.aggregator.disconnect()
    }
    if (this.typeAggregationEventSubscription) {
      this.typeAggregationEventSubscription.unsubscribe()
    }
    if (this.currentAggregationJob) {
      if (this.typeAggregationModeSubscription) {
        this.typeAggregationModeSubscription.unsubscribe()
      }
      this.aggregationAggregator.disconnect()
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
        this.aggregator.connect(this.currentBpmnJob.host, this.currentBpmnJob.port)
        var timeout = undefined
        this.instanceAggregatorEventSubscription = this.aggregator.getEventEmitter().subscribe((data) => {
          if (data['update']?.['perspectives'] != undefined) {
            if (this.diagramPerspectives.length != 0) {
              if (timeout != undefined) {
                clearTimeout(timeout)
                timeout = undefined
              }
              var context = this
              timeout = setTimeout(function () {
                context.diagramPerspectives = data['update']['perspectives'] as ProcessPerspective[]
                timeout = undefined
              }, 1000);
            }
            else {
              this.diagramPerspectives = data['update']['perspectives'] as ProcessPerspective[]
            }
          }
          if (data['update']?.['overlays'] != undefined) {
            var overlays = data['update']['overlays'] as BpmnBlockOverlayReport[]
            this.diagramOverlays = overlays
          }
        });
        this.aggregator.subscribeJob(this.currentBpmnJob.job_id)
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
      }
      else {
        this.isResult = false
      }
    }
  }

  // Handle aggregation HTTP responses (equivalent to applyUpdate for aggregation)
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
      this.isResult = true // Show the aggregation list
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

  // User action to switch to aggregation view (equivalent to onSearch)
  switchToAggregationView() {
    this.viewMode = 'aggregation'

    // Clean up instance view data
    if (this.currentBpmnJob) {
      this.instanceAggregatorEventSubscription.unsubscribe()
      this.aggregator.disconnect()
      this.currentBpmnJob = undefined
    }

    // Clear instance-specific data
    this.diagramPerspectives = []
    this.diagramOverlays = []
    this.currentProcessId = ''
    this.currentProcessType = ''
    this.isResult = false

    if (!this.typeAggregationEventSubscription) {
      this.typeAggregationEventSubscription = this.supervisorService.AggregatorEventEmitter.subscribe((update: any) => {
        this.applyAggregatorUpdate(update)
      })
    }

    // Request aggregation data
    this.requestAvailableAggregations()
  }

  // User selects an aggregation job
  onAggregationSelected(processType: string) {
    // Just request data - WebSocket connection will happen in applyAggregatorUpdate()
    this.currentProcessType = processType
    this.requestAggregationData(processType)
  }

  // Switch back to instance view
  switchToInstanceView() {
    this.viewMode = 'instance'
    this.isResult = false

    // Clean up aggregation mode
    if (this.typeAggregationEventSubscription) {
      this.typeAggregationEventSubscription.unsubscribe()
      this.typeAggregationEventSubscription = undefined
    }
    if (this.currentAggregationJob) {
      if (this.typeAggregationModeSubscription) {
        this.typeAggregationModeSubscription.unsubscribe()
      }
      this.aggregationAggregator.disconnect()
      this.currentAggregationJob = undefined
    }

    // Clear aggregation-specific data
    this.diagramPerspectives = []
    this.diagramOverlays = []
    this.aggregationSummary = undefined
    this.availableAggregations = []
    this.currentProcessType = ''
    this.currentProcessId = ''
  }

  // New request methods (equivalent to requestProcessData)
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

    if (this.currentBpmnJob) {
      this.instanceAggregatorEventSubscription.unsubscribe()
      this.aggregator.disconnect()
      this.currentBpmnJob = undefined
      this.diagramPerspectives = []
    }
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

  // UI helper methods
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
}