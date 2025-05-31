import { Component, ViewChild, ViewChildren } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AggregatorConnector } from '../AggregatorConnector';
import { BpmnComponent } from '../bpmn/bpmn.component';
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
  status: string;
}

@Component({
  selector: 'app-engines',
  templateUrl: './engines.component.html',
  styleUrls: ['./engines.component.scss']
})
export class EnginesComponent {
  eventSubscription: any
  aggregatorEventSubscription: any
  currentProcessType: string
  currentProcessId: string
  currentBpmnJob: any = undefined
  diagramPerspectives: ProcessPerspective[] = []
  diagramOverlays: BpmnBlockOverlayReport[] = []
  aggregator: AggregatorConnector = new AggregatorConnector()
  isResult: boolean = false

  // New aggregation properties
  viewMode: 'instance' | 'aggregation' = 'instance'
  availableAggregations: AggregationJob[] = []
  currentAggregationJob: any = undefined
  aggregationSummary: any = undefined

  selectedTabIndex = 0;

  @ViewChild('engines') engineList: EngineListComponent
  @ViewChildren('bpmn_diagrams') bpmnDiagrams: BpmnComponent[]

  constructor(private supervisorService: SupervisorService, private snackBar: MatSnackBar, private loadingService: LoadingService, public deleteProcessDialog: MatDialog) {
    this.eventSubscription = this.supervisorService.ProcessSearchEventEmitter.subscribe((update: any) => {
      this.applyUpdate(update)
    })

    // Subscribe to aggregator updates
    this.supervisorService.AggregatorEventEmitter.subscribe((update: any) => {
      this.applyAggregatorUpdate(update)
    })
  }

  ngOnInit() {
    // Request available aggregation jobs on component init
    this.requestAvailableAggregations()
  }

  ngOnDestroy() {
    this.eventSubscription.unsubscribe()
    if (this.currentBpmnJob) {
      this.aggregatorEventSubscription.unsubscribe()
      this.aggregator.disconnect()
    }
  }

  applyUpdate(update: any) {
    this.loadingService.setLoadningState(false)
    var engines = update['engines'] || undefined
    var deleteResult = update['delete_result'] || undefined

    if (engines != undefined && engines.length > 0) {
      this.engineList.update(update['engines'])
      this.isResult = true
      this.currentProcessType = update['engines'][0].type

      // Only run when in instance mode
      if (this.viewMode === 'instance' && update['bpmn_job'] != 'not_found') {
        this.currentBpmnJob = update['bpmn_job']
        this.aggregator.connect(this.currentBpmnJob.host, this.currentBpmnJob.port)
        var timeout = undefined
        this.aggregatorEventSubscription = this.aggregator.getEventEmitter().subscribe((data) => {
          if (data['update']?.['perspectives'] != undefined) {
            //var diagramPerspectivesTmp = data['update']['perspectives'] as ProcessPerspective[]
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
    } else if (engines != undefined) {
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

  applyAggregatorUpdate(update: any) {
    if (!update) {
      console.warn('Received undefined update in applyAggregatorUpdate');
      return;
    }

    console.log('Aggregator update received:', update);

    if (update['payload']?.['available_aggregations']) {
      this.availableAggregations = update['payload']['available_aggregations']
    }

    // Handle complete aggregation data
    if (update['complete_aggregation_data'] && this.viewMode === 'aggregation') {
      const data = update['complete_aggregation_data'];
      this.diagramPerspectives = data.perspectives || [];
      this.diagramOverlays = data.overlays || [];
      this.aggregationSummary = data.summary || {};

      // Apply overlays after perspectives are set
      setTimeout(() => {
        this.applyOverlaysToGraphics();
      }, 500);

      this.loadingService.setLoadningState(false);
    }
  }

  switchToAggregationView(processType: string) {
    this.viewMode = 'aggregation'
    this.currentProcessType = processType
    this.isResult = true

    // Disconnect from instance view if connected
    if (this.currentBpmnJob) {
      this.aggregatorEventSubscription.unsubscribe()
      this.aggregator.disconnect()
      this.currentBpmnJob = undefined
    }

    // Request aggregation data
    this.requestAggregationData(processType)
  }

  switchToInstanceView() {
    this.viewMode = 'instance'
    this.currentAggregationJob = undefined
    this.aggregationSummary = undefined
  }

  requestAvailableAggregations() {
    this.supervisorService.requestUpdate('aggregators', { request_type: 'available_aggregations' })
  }

  requestAggregationData(processType: string) {
    this.loadingService.setLoadningState(true);
    const payload = {
      request_type: 'complete_aggregation_data',
      process_type: processType
    };
    this.supervisorService.requestUpdate('aggregators', payload);
  }

  onAggregationSelected(processType: string) {
    this.switchToAggregationView(processType)
  }

  getAggregationForProcessType(processType: string): AggregationJob | undefined {
    return this.availableAggregations.find(agg => agg.process_type === processType)
  }

  applyOverlaysToGraphics() {
    setTimeout(() => {
      this.diagramOverlays.forEach(overlay => {
        var diagram = this.bpmnDiagrams.find(element => element.model_id == overlay.perspective)
        if (diagram) {
          diagram.applyOverlayReport([overlay])
        }
      });
    }, 1000);
  }

  // Original methods with minimal modifications
  onSearch(instance_id: any) {
    this.snackBar.dismiss()
    this.currentProcessId = instance_id
    this.viewMode = 'instance'  // Ensure we're in instance mode
    this.requestProcessData()

    if (this.currentBpmnJob) {
      this.aggregatorEventSubscription.unsubscribe()
      this.aggregator.disconnect()
      this.currentBpmnJob = undefined
      this.diagramPerspectives = []
    }
  }

  /**
   * Initiates the termination of the currently represented Process Instance 
   * Should not be called when 'this.currentProcessId' is undefined or invalid (so when the delete button is hided) 
   */
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

  /**
   * Diagram event handler function
   * 'INIT_DONE' event: It means that the inicialization of the diagram is finished (based on the supplied XML) The function will pass the available overlays to the BPMN module 
   * @param event Event content
   */
  onDiagramEvent(event: string) {
    if (event == 'INIT_DONE') {
      this.applyOverlaysToGraphics()
    }
  }

  /**
   * Requests on the back-end the termination of the currently visualized Process Instance
   */
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

  getSeverityClass(deviationRate: number): string {
    if (deviationRate >= 75) return 'critical';
    if (deviationRate >= 50) return 'high';
    if (deviationRate >= 25) return 'medium';
    return 'low';
  }

  getPerspectiveColor(deviationRate: number): string {
    if (deviationRate >= 75) return 'warn';
    if (deviationRate >= 50) return 'accent';
    if (deviationRate >= 25) return 'primary';
    return 'primary';
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'primary';
      case 'INACTIVE': return 'warn';
      case 'STARTING': return 'accent';
      default: return 'basic';
    }
  }
}