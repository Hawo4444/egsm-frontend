import { EventEmitter } from '@angular/core';
import { webSocket } from 'rxjs/webSocket';

const API_PROTOCOL = 'data-connection'

/**
 * Establishes Websocket Connection with a specified Aggregator instance and provides communication interfact to maintain full-duplex communication
 */
export class AggregatorConnector {
    socket = undefined
    observable = undefined
    public eventEmitter:EventEmitter<any>
    private subscription: any = null
    private connected: boolean = false

    constructor() { }

    /**
     * Connects to the specified Websocket Server (which should belong to an Aggregator)
     * @param host 
     * @param port 
     */
    connect(host: string, port: number) {
        this.eventEmitter = new EventEmitter();
        this.socket = webSocket({ url: `ws://${host}:${port}`, protocol: API_PROTOCOL });
        this.observable = this.socket.subscribe({
            next: msg => this.messageHandler(msg),
            error: err => console.log(err),
            complete: () => console.log('Disconnected from Aggregator')
        });
        this.connected = true
    }

    /**
     * Closes the connection with the Aggregator
     */
    disconnect() {
        console.log('Disconnecting from Aggregator')
        if (this.subscription) {
            this.subscription.unsubscribe()
            this.subscription = null
        }
        this.connected = false
    }

    messageHandler(msg: any) {
        switch (msg['type']) {
            case 'job_update':
                this.eventEmitter.emit(msg['payload'])
                break;
        }
    }

    /**
     * Subscribes to updates from a specified job (jobid)
     * @param jobid Id of the job
     */
    subscribeJob(jobid: string) {
        let newMessage = {
            type: "job_update",
            payload: { job_id: jobid }
        }
        this.socket.next(JSON.stringify(newMessage))
    }

    getEventEmitter(){
        return this.eventEmitter
    }

    isConnected(): boolean {
        return this.connected
    }
}
