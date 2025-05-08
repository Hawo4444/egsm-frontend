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

  @ViewChild('engines') engineList: EngineListComponent
  @ViewChildren('bpmn_diagrams') bpmnDiagrams: BpmnComponent[]

  constructor(private supervisorService: SupervisorService, private snackBar: MatSnackBar, private loadingService: LoadingService, public deleteProcessDialog: MatDialog) {
    this.eventSubscription = this.supervisorService.ProcessSearchEventEmitter.subscribe((update: any) => {
      this.applyUpdate(update)
    })
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
      if (update['bpmn_job'] != 'not_found') {
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
    }
    else if (engines != undefined) {
      this.snackBar.open(`The requested Process Instance does not found!`, "Hide", { duration: 2000 });
      this.isResult = false
    }

    if (deleteResult) {
      if (deleteResult == "ok") {
        this.snackBar.open(`The process has been deleted`, "Hide", { duration: 2000 });
        this.currentBpmnJob = undefined
        this.isResult = false
      }
      else {
        //this.snackBar.open(`Server error occurred while deleting the process`, "Hide", { duration: 2000 });
        this.isResult = false
      }
    }
  }

  /**
   * Initiates a search on the back-end for the process specified by 'instance_id'
   * @param instance_id Id of the requested Process Instance
   */
  onSearch(instance_id: any) {
    this.snackBar.dismiss()
    this.currentProcessId = instance_id
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
      var context = this
      setTimeout(function () {
        context.diagramOverlays.forEach(overlay => {
          var diagram = context.bpmnDiagrams.find(element => element.model_id == overlay.perspective)
          if (diagram) {
            diagram.applyOverlayReport([overlay])
          }
        });
      }, 1000);
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
}