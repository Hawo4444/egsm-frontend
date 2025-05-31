import { Injectable, Output } from '@angular/core';
import { Subject } from 'rxjs';
import { webSocket } from 'rxjs/webSocket';

const API_ENDPOINT = 'ws://localhost:8081'
const API_PROTOCOL = 'data-connection'

@Injectable({
  providedIn: 'root'
})
export class SupervisorService {
  //Specific Event Services for each relevant modules
  @Output() OverviewEventEmitter: Subject<any> = new Subject();
  @Output() SystemInformationEventEmitter: Subject<any> = new Subject();
  @Output() WorkerDialogEventEmitter: Subject<any> = new Subject();
  @Output() ProcessSearchEventEmitter: Subject<any> = new Subject()
  @Output() LibraryEventEmitter: Subject<any> = new Subject()
  @Output() NewProcessInstaceEventEmitter: Subject<any> = new Subject()
  @Output() ArtifactInformationEventEmitter: Subject<any> = new Subject()
  @Output() StakeholderInformationEventEmitter: Subject<any> = new Subject()
  @Output() NotificationEventEmitter: Subject<any> = new Subject()
  @Output() NewProcessGroupEventEmitter: Subject<any> = new Subject()
  @Output() AggregatorEventEmitter: Subject<any> = new Subject()
  @Output() ProcessTypeDetailEventEmitter: Subject<any> = new Subject()


  subject = webSocket({ url: API_ENDPOINT, protocol: API_PROTOCOL });

  constructor() {
    this.subject.subscribe({
      next: msg => this.messageHandler(msg),
      error: err => console.log(err),
      complete: () => console.log('Disconnected from Supervisor')
    });
  }

  messageHandler(msg: any) {
    switch (msg['module']) {
      case 'overview':
        this.OverviewEventEmitter.next(msg['payload'])
        break;
      case 'system_information':
        this.SystemInformationEventEmitter.next(msg['payload'])
        break;
      case 'worker_detail':
        this.WorkerDialogEventEmitter.next(msg['payload'])
        break;
      case 'process_operation':
        this.ProcessSearchEventEmitter.next(msg['payload'])
        break;
      case 'process_library':
        this.LibraryEventEmitter.next(msg['payload'])
        break;
      case 'new_process_instance':
        this.NewProcessInstaceEventEmitter.next(msg['payload'])
        break;
      case 'artifact_detail':
        this.ArtifactInformationEventEmitter.next(msg['payload'])
        break;
      case 'stakeholder_detail':
        this.StakeholderInformationEventEmitter.next(msg['payload'])
        break;
      case 'notifications':
        this.NotificationEventEmitter.next(msg['payload'])
        break;
      case 'new_process_group':
        this.NewProcessGroupEventEmitter.next(msg['payload'])
        break;
      case 'aggregators':
        this.AggregatorEventEmitter.next(msg['payload'])
        break
      case 'process_type_detail':
        this.ProcessTypeDetailEventEmitter.next(msg['payload'])
        break
      case 'available_aggregations':
        this.AggregatorEventEmitter.next(msg['payload'])
        break
    }
  }

  /**
   * Requests an update from the supervisor
   * @param module Module the request initiated by 
   * @param payload Content of the request
   */
  requestUpdate(module: string, payload: any = '') {
    let newMessage = {
      type: "update_request",
      module: module,
      payload: payload
    }
    this.subject.next(JSON.stringify(newMessage))
  }

  /**
   * Sending a command to the Supervisor
   * @param module Module the command initiated by
   * @param payload Content of the command
   */
  sendCommand(module: string, payload: any = '') {
    let newMessage = {
      type: "command",
      module: module,
      payload: payload
    }
    this.subject.next(JSON.stringify(newMessage))
  }
}
