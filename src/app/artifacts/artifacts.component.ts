import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ArtifactDetailComponent } from '../artifact-detail/artifact-detail.component';
import { LoadingService } from '../loading.service';
import { SupervisorService } from '../supervisor.service';
import { Artifact } from '../primitives/primitives';

const MODULE_STORAGE_KEY = 'artifact_detail'

@Component({
  selector: 'app-artifacts',
  templateUrl: './artifacts.component.html',
  styleUrls: ['./artifacts.component.scss']
})
export class ArtifactsComponent implements OnInit {
  eventSubscription: any
  isResult: boolean = false

  @ViewChild('artifact_details') artifactDetails: ArtifactDetailComponent
  constructor(private supervisorService: SupervisorService, private snackBar: MatSnackBar, private loadingService: LoadingService, public deleteProcessDialog: MatDialog) {
    this.eventSubscription = this.supervisorService.ArtifactInformationEventEmitter.subscribe((update: any) => {
      this.applyUpdate(update)
    })
  }

  ngOnInit(): void {

  }

  ngOnDestroy() {
    this.eventSubscription.unsubscribe()
  }

  applyUpdate(update: any) {
    this.loadingService.setLoadningState(false)
    var result = update['result'] || undefined
    if (update['type'] == 'search') {
      if (result == 'found') {

        this.artifactDetails.update(update['artifact'])
        this.isResult = true
      }
      else {
        this.snackBar.open(`The requested Artifact Instance not found!`, "Hide", { duration: 2000 });
        this.isResult = false
      }
    }
    else if (update['type'] == 'create') {
      if (result == 'created') {
        this.snackBar.open(`New Artifact has been successfully added to Database`, "Hide", { duration: 2000 });
      }
      else if (result == 'already_exists') {
        this.snackBar.open(`An Artifact with the provided Type and ID is already exist`, "Hide", { duration: 2000 });
      }
      else {
        this.snackBar.open(`Error while creating Artifact`, "Hide", { duration: 2000 });
      }
    }
    else if (update['type'] == 'delete') {

    }
  }

  onSearch(artifact_type: string, artifact_id: string): void {
    this.snackBar.dismiss()
    if (artifact_type.length == 0 || artifact_id.length == 0) {
      this.snackBar.open(`Please provide all necessary arguments!`, "Hide", { duration: 2000 });
      return
    }
    this.requestArtifactData(artifact_type, artifact_id)
  }

  onCreate(artifact_type: string, artifact_id: string, mqtt_host: string, mqtt_port: string, stakeholders: string): void {
    this.snackBar.dismiss()
    if (artifact_type.length == 0 || artifact_id.length == 0 || mqtt_host.length == 0 || mqtt_port.length == 0 || stakeholders.length == 0) {
      this.snackBar.open(`Please provide all necessary arguments!`, "Hide", { duration: 2000 });
      return
    }

    this.createArtifact(artifact_type, artifact_id, mqtt_host, mqtt_port, stakeholders)
  }

  onDelete(artifact_name: string): void {
    //NOTE: Probably delete will not be needed, since it would break historical statistics on the backend
  }

  requestArtifactData(artifact_type: string, artifact_id: string) {
    this.loadingService.setLoadningState(true)
    var payload = {
      type: 'search',
      artifact_type: artifact_type,
      artifact_id: artifact_id
    }
    this.supervisorService.requestUpdate(MODULE_STORAGE_KEY, payload)
  }

  createArtifact(artifact_type: string, artifact_id: string, mqtt_host: string, mqtt_port: string, stakeholders: string) {
    this.loadingService.setLoadningState(true)
    const newArtifact: Artifact = { type: artifact_type, id: artifact_id, host: mqtt_host, port: Number(mqtt_port), stakeholders: stakeholders.split(';') };
    var payload = {
      artifact: newArtifact,
      type: 'create'
    }
    this.supervisorService.sendCommand(MODULE_STORAGE_KEY, payload)
  }
}
