import {
  AfterContentInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  SimpleChanges,
  Output,
} from '@angular/core';

import * as BpmnModeler from 'bpmn-js/dist/bpmn-modeler.production.min.js';
import { Subject } from 'rxjs';
import { BpmnBlockOverlayReport, Color, ProcessPerspectiveStatistic } from '../primitives/primitives';


@Component({
  selector: 'app-bpmn',
  templateUrl: './bpmn.component.html',
  styleUrls: ['./bpmn.component.scss'],
})

export class BpmnComponent implements AfterContentInit, OnDestroy {
  bpmnJS: BpmnModeler = undefined //The BPMN Modeller instance
  elementNamesMap = new Map<string, string>();

  @ViewChild('ref', { static: true }) private el: ElementRef;

  @Input() show_statistics: boolean;
  @Input() public model_id: string;
  @Input() public model_xml: string;
  @Output() DiagramEventEmitter: Subject<any> = new Subject();

  blockStatistics = new Map() //Containing statistics for block (Block name -> {Statistics})
  blockProperties = new Map() //Block name -> {BpmnBlockOverlayReport}

  visibleOverlays = new Map() //Block name where the overlay attached to AND/OR unique role ID (e.g.: 'statisctic-overlay') -> Library generated Overlay ID (needed to make possible removals)

  constructor() {
    this.bpmnJS = new BpmnModeler();
  }

  ngAfterContentInit(): void {
    this.bpmnJS.attachTo(this.el.nativeElement);
    if (this.model_xml) {
      this.updateModelXml(this.model_xml)
      this.populateElementNames()
    }

    var eventBus = this.bpmnJS.get('eventBus'); //Eventbus to receive diagram events
    var bpmnJsRef = this.bpmnJS

    if (this.show_statistics) {
      var visibleOveraysCopy = this.visibleOverlays
      var context = this
      eventBus.on('element.hover', function (e) {
        var elementId = e.element.id
        if (context.blockStatistics.has(elementId)) {
          var overlay = bpmnJsRef.get('overlays');
          if (visibleOveraysCopy.has('statisctic-overlay')) {
            overlay.remove(visibleOveraysCopy.get('statisctic-overlay'))
            visibleOveraysCopy.delete('statisctic-overlay')
          }
          visibleOveraysCopy.set('statisctic-overlay', overlay.add(elementId, {
            position: {
              top: -25,
              right: 0
            },
            html: `<div style="width: 300px; background-color:#ffcc66;"><h1>${elementId} - Historical</h1>` +
              `<p>Regular: ${context.blockStatistics.get(elementId).values.regular}<br>` +
              `Faulty: ${context.blockStatistics.get(elementId).values.faulty}<br>` +
              `Unopened: ${context.blockStatistics.get(elementId).values.unopened}<br>` +
              `Opened: ${context.blockStatistics.get(elementId).values.opened}<br>` +
              `Skipped: ${context.blockStatistics.get(elementId).values.skipped}<br>` +
              `OnTime: ${context.blockStatistics.get(elementId).values.onTime}<br>` +
              `OutOfOrder: ${context.blockStatistics.get(elementId).values.outOfOrder}<br>` +
              `SkipDeviation Skipped: ${context.blockStatistics.get(elementId).values.skipdeviation_skipped}<br>` +
              `SkipDeviation OoO: ${context.blockStatistics.get(elementId).values.skipdeviation_outoforder}<br>` +
              `Flow Violation: ${context.blockStatistics.get(elementId).values.flow_violation}<br>` +
              `Incomplete Execution: ${context.blockStatistics.get(elementId).values.incomplete_execution}<br>` +
              `Multi Execution Deviation: ${context.blockStatistics.get(elementId).values.multi_execution}</p>` +
              `<h1>Real Time</h1>` +
              `<p>Regular: ${context.blockStatistics.get(elementId).values.real_time_regular}<br>` +
              `Faulty: ${context.blockStatistics.get(elementId).values.real_time_faulty}<br>` +
              `Unopened: ${context.blockStatistics.get(elementId).values.real_time_unopened}<br>` +
              `Opened: ${context.blockStatistics.get(elementId).values.real_time_opened}<br>` +
              `Skipped: ${context.blockStatistics.get(elementId).values.real_time_skipped}<br>` +
              `Ontime: ${context.blockStatistics.get(elementId).values.real_time_ontime}<br>` +
              `OutOfOrder: ${context.blockStatistics.get(elementId).values.real_time_outoforder}</p>` +
              `</div>`
          }));
        }
      })
    }
    this.DiagramEventEmitter.next('INIT_DONE')
  }

  /**
   * Function to update the XML describing the displayed diagram
   * Since this XML contains the foundations of the diagram as a side-effect this function clears all
   * block properties, block overlays and block statistics, because on the new diagram they may have no effect,
   * or they would lead to unexpected behavior
   * @param value Bpmn diagram in XML format
   */
  updateModelXml(value: string) {
    if (value) {
      this.blockStatistics.clear()
      this.blockProperties.clear()
      this.visibleOverlays.clear()
      this.bpmnJS.importXML(value)
      this.bpmnJS.on('import.done', ({ error }) => {
        if (!error) {
          this.bpmnJS.get('canvas').zoom('fit-viewport');
        }
      });
    }
  }

  populateElementNames(): void {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(this.model_xml, 'application/xml');
    const elements = xmlDoc.querySelectorAll('[id]');
    elements.forEach(element => {
      const id = element.getAttribute('id');
      const name = element.getAttribute('name') || '';
      if (id) {
        this.elementNamesMap.set(id, name);
      }
    });
  }

  /**
   * Apply a list of BpmnBlockOverlayReport-s on the diagram
   * The function iterates through all reports in the 'overlayreport' attribute and applies its content on the diagram
   * BpmnBlockOverlayReport-s can change block color or add icon(s) to blocks
   * @param overlayreport List of BpmnBlockOverlayReport-s
   */
  applyOverlayReport(overlayreport: BpmnBlockOverlayReport[]) {
    var overlay = this.bpmnJS.get('overlays');
    overlayreport.forEach(element => {
      //Check if the element.id exists in this.visibleOverlays
      //If yes then check if the new overlay introduces any changes
      if (this.blockProperties.has(element.block_id)) {
        if (this.blockProperties.get(element.block_id).color != element.color) {
          this.setBlockColor(element.block_id, element.color)
          this.blockProperties.get(element.block_id).color = element.color
        }
        this.blockProperties.get(element.block_id).flags.forEach(flag => {
          if (!element.flags.some(f => f.deviation === flag)) {
            // Remove flag since it's no longer part of the report
            overlay.remove(this.visibleOverlays.get(element.block_id + flag));
            this.visibleOverlays.delete(element.block_id + flag);
            this.blockProperties.get(element.block_id).flags.delete(flag);
          }
        })
        element.flags.forEach(flag => {
          if (!this.visibleOverlays.has(element.block_id + "_" + flag.deviation)) {
            this.addFlagToOverlay(element.block_id, flag);
          }
        });
      } else {
        this.blockProperties.set(element.block_id, { color: element.color, flags: new Set(element.flags.map(f => f.deviation)) });
        this.setBlockColor(element.block_id, element.color);
        element.flags.forEach(flag => {
          this.addFlagToOverlay(element.block_id, flag);
        });
      }
    });
  }

  /**
   * Adds a flag to an element on the diagram
   * If a certain type of flag is already added to a block, the function will not add it again to avoid duplicating flags
   * @param elementId Id of the block the flag should be added to
   * @param flag Type of the flag
   */
  addFlagToOverlay(elementId: string, flag: { deviation: string, details: any }) {
    var overlay = this.bpmnJS.get('overlays');
    var flagNumber = 0
    for (const [key, value] of this.visibleOverlays.entries()) {
      if (key.includes(elementId)) {
        flagNumber++
      }
    }

    switch (flag.deviation) {
      case 'INCOMPLETE':
        var html = `<img width="25" height="25" src="assets/hazard.png"> `
        break;
      /*case 'MULTI_EXECUTION':
        var html = `<img width="25" height="25" src="assets/repeat.png"> `
        break*/
      case 'MULTI_EXECUTION':
        const count = flag.details?.count ?? '?'
        var html = `<img width="25" height="25" src="assets/repeat.png" title="Executions: ${count}">`
        break
      case 'INCORRECT_EXECUTION':
        var html = `<img width="25" height="25" src="assets/cross.png"> `
        break
      case 'INCORRECT_BRANCH':
        var html = `<img width="25" height="25" src="assets/cross.png"> `
        break
      case 'SKIPPED':
        var html = `<img width="25" height="25" src="assets/skip.webp"> `
        break
      case 'OVERLAP':
        const over = flag.details?.over?.map(id => this.getElementNameById(id))?.join("<br>") ?? '?';
        var html = `<img src="assets/arrows.png" title="Overlaps:\n ${over}" style="transform: rotate(90deg); width:25px; height:25px;"> `;
        break
    }
    this.visibleOverlays.set(elementId + "_" + flag, overlay.add(elementId, {
      position: {
        top: -28,
        right: 30 * flagNumber
      },
      html: html
    }));
  }

  /**
   * Updates a list of ProcessPerspectiveStatistic instances on the diagram
   * If statistic for a certain block is already exists then the function will overwrite it if any of the provided ProcessPerspectiveStatistic instances 
   * regards that particular block
   * @param perspectiveStatistic 
   */
  updateStatistics(perspectiveStatistic: ProcessPerspectiveStatistic) {
    if (this.show_statistics) {
      this.blockStatistics.clear()
      perspectiveStatistic.statistics.forEach(element => {
        this.blockStatistics.set(element.id, element)
      });
    }
    else {
      console.warn("updateStatistics is not enabled since showStatistics is False")
    }
  }

  /**
   * Updates the color of a block (edge, event, task etc.)
   * @param taskId Id of the block
   * @param color New color as a {stroke; fill} object
   */
  setBlockColor(taskId: string, color: Color) {
    var modeling = this.bpmnJS.get('modeling');
    var elementRegistry = this.bpmnJS.get('elementRegistry');
    var element = elementRegistry.get(taskId)
    if (color == undefined) {
      modeling.setColor([element], null);
    }
    else {
      modeling.setColor([element], { stroke: color.stroke, fill: color.fill });
    }
  }

  getElementNameById(elementId: string): string {
    return this.elementNamesMap.get(elementId) || 'Element not found';
  }

  ngOnDestroy(): void {
    this.bpmnJS.destroy();
  }
}