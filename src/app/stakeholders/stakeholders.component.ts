import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '../loading.service';
import { Stakeholder } from '../primitives/primitives';
import { StakeholderDetailComponent } from '../stakeholder-detail/stakeholder-detail.component';
import { SupervisorService } from '../supervisor.service';

const MODULE_STORAGE_KEY = 'stakeholder_detail'

@Component({
  selector: 'app-stakeholders',
  templateUrl: './stakeholders.component.html',
  styleUrls: ['./stakeholders.component.scss']
})
export class StakeholdersComponent implements OnInit {
  isResult = false
  eventSubscription: any
  @ViewChild('stakeholder_details') stakeholderDetails: StakeholderDetailComponent

  constructor(private supervisorService: SupervisorService, private snackBar: MatSnackBar, private loadingService: LoadingService, public deleteProcessDialog: MatDialog) {
    this.eventSubscription = this.supervisorService.StakeholderInformationEventEmitter.subscribe((update: any) => {
      this.applyUpdate(update)
    })
  }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    this.eventSubscription.unsubscribe()
  }

  applyUpdate(update: any) {
    this.loadingService.setLoadningState(false)
    var result = update['result'] || undefined
    if (update['type'] == 'search') {
      if (result == 'found') {
        this.stakeholderDetails.update(update['stakeholder'] as Stakeholder)
        this.isResult = true
      }
      else {
        this.snackBar.open(`The requested Stakeholder not found!`, "Hide", { duration: 2000 });
        this.isResult = false
      }
    }
    else if (update['type'] == 'create') {
      if (result == 'created') {
        this.snackBar.open(`New Stakeholder has been successfully added to Database`, "Hide", { duration: 2000 });
      }
      else if (result == 'already_exists') {
        this.snackBar.open(`A Stakeholder with the provided ID is already exist`, "Hide", { duration: 2000 });
      }
      else {
        this.snackBar.open(`Error while creating Stakeholder`, "Hide", { duration: 2000 });
      }
    }
    else if (update['type'] == 'delete') {

    }
  }

  onCreate(stakeholder_name: string) {
    this.snackBar.dismiss()
    if (stakeholder_name.length == 0) {
      this.snackBar.open(`Please provide all necessary arguments!`, "Hide", { duration: 2000 });
      return
    }
    this.createStakeholder(stakeholder_name)
  }

  onSearch(stakeholder_name: string) {
    this.snackBar.dismiss()
    if (stakeholder_name.length == 0) {
      this.snackBar.open(`Please provide all necessary arguments!`, "Hide", { duration: 2000 });
      return
    }
    this.requestStakeholderData(stakeholder_name)
  }

  /**
   * Requests details of a specified Stakeholder from the back-end 
   * @param stakeholder_name Name of the requested Stakeholder
   */
  requestStakeholderData(stakeholder_name: string) {
    this.loadingService.setLoadningState(true)
    var payload = {
      stakeholder_name: stakeholder_name
    }
    this.supervisorService.requestUpdate(MODULE_STORAGE_KEY, payload)
  }

  /**
   * Initiates the creation of a new Stakeholder on the back-end
   * @param stakeholder_name Name of the new Stakeholder
   */
  createStakeholder(stakeholder_name: string) {
    this.loadingService.setLoadningState(true)
    var payload = {
      stakeholder_name: stakeholder_name,
      type: 'create'
    }
    this.supervisorService.sendCommand(MODULE_STORAGE_KEY, payload)
  }
}
