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

import { Subject } from 'rxjs';
import { BpmnBlockOverlayReport, Color, ProcessPerspectiveStatistic } from '../primitives/primitives';
import { BaseBpmnComponent } from './base-bpmn.component';

@Component({
  selector: 'app-bpmn',
  templateUrl: './bpmn.component.html',
  styleUrls: ['./bpmn.component.scss'],
})
export class BpmnComponent extends BaseBpmnComponent implements AfterContentInit {
  cumulativeOverlaps = new Map();
  cumulativeIterations = new Map();
  blockStatistics = new Map();
  flagCounts = new Map();

  @ViewChild('ref', { static: true }) private el: ElementRef;
  @Input() show_statistics: boolean;
  @Input() public model_id: string;
  @Input() public model_xml: string;
  @Output() DiagramEventEmitter: Subject<any> = new Subject();

  ngAfterContentInit(): void {
    this.bpmnJS.attachTo(this.el.nativeElement);
    if (this.model_xml) {
      this.updateModelXml(this.model_xml);
      this.populateElementNames(this.model_xml);
    }

    this.setupEventHandlers();
    this.DiagramEventEmitter.next('INIT_DONE');
  }

  protected override onModelClear(): void {
    this.blockStatistics.clear();
    this.cumulativeOverlaps.clear();
    this.cumulativeIterations.clear();
    this.flagCounts.clear();
  }

  private setupEventHandlers() {
    if (this.show_statistics) {
      const eventBus = this.bpmnJS.get('eventBus');
      const bpmnJsRef = this.bpmnJS;
      const visibleOveraysCopy = this.visibleOverlays;
      const context = this;

      eventBus.on('element.hover', function (e) {
        const elementId = e.element.id;
        if (context.blockStatistics.has(elementId)) {
          const overlay = bpmnJsRef.get('overlays');
          if (visibleOveraysCopy.has('statisctic-overlay')) {
            overlay.remove(visibleOveraysCopy.get('statisctic-overlay'));
            visibleOveraysCopy.delete('statisctic-overlay');
          }
          visibleOveraysCopy.set('statisctic-overlay', overlay.add(elementId, {
            position: {
              top: -25,
              right: 0
            },
            html: context.createStatisticsHtml(elementId)
          }));
        }
      });
    }
  }

  private createStatisticsHtml(elementId: string): string {
    const stats = this.blockStatistics.get(elementId).values;
    return `<div style="width: 300px; background-color:#ffcc66;"><h1>${elementId} - Historical</h1>` +
      `<p>Regular: ${stats.regular}<br>` +
      `Faulty: ${stats.faulty}<br>` +
      `Unopened: ${stats.unopened}<br>` +
      `Opened: ${stats.opened}<br>` +
      `Skipped: ${stats.skipped}<br>` +
      `OnTime: ${stats.onTime}<br>` +
      `OutOfOrder: ${stats.outOfOrder}<br>` +
      `SkipDeviation Skipped: ${stats.skipdeviation_skipped}<br>` +
      `SkipDeviation OoO: ${stats.skipdeviation_outoforder}<br>` +
      `Flow Violation: ${stats.flow_violation}<br>` +
      `Incomplete Execution: ${stats.incomplete_execution}<br>` +
      `Multi Execution Deviation: ${stats.multi_execution}</p>` +
      `<h1>Real Time</h1>` +
      `<p>Regular: ${stats.real_time_regular}<br>` +
      `Faulty: ${stats.real_time_faulty}<br>` +
      `Unopened: ${stats.real_time_unopened}<br>` +
      `Opened: ${stats.real_time_opened}<br>` +
      `Skipped: ${stats.real_time_skipped}<br>` +
      `Ontime: ${stats.real_time_ontime}<br>` +
      `OutOfOrder: ${stats.real_time_outoforder}</p>` +
      `</div>`;
  }

  applyOverlayReport(overlayreport: BpmnBlockOverlayReport[]) {
    this.cumulativeOverlaps.clear();
    this.cumulativeIterations.clear();

    overlayreport.forEach(element => {
      if (this.blockProperties.has(element.block_id)) {
        if (this.blockProperties.get(element.block_id).color != element.color) {
          this.setBlockColor(element.block_id, element.color);
          this.blockProperties.get(element.block_id).color = element.color;
        }

        const currentFlags = new Set(Array.from(this.blockProperties.get(element.block_id).flags));

        currentFlags.forEach(flag => {
          if (!element.flags.some(f => f.deviation === flag)) {
            this.removeOverlay(element.block_id + "_" + flag);
            this.blockProperties.get(element.block_id).flags.delete(flag);

            if (this.iconPositions.has(element.block_id)) {
              const positions = this.iconPositions.get(element.block_id)!;
              if (positions[flag as string]) {
                delete positions[flag as string];
              }
            }
          }
        });

        element.flags.forEach(flag => {
          this.addFlagToOverlay(element.block_id, flag);
          if (!this.blockProperties.get(element.block_id).flags.has(flag.deviation)) {
            this.blockProperties.get(element.block_id).flags.add(flag.deviation);
          }
        });
      } else {
        this.blockProperties.set(element.block_id, {
          color: element.color,
          flags: new Set(element.flags.map(f => f.deviation))
        });
        this.setBlockColor(element.block_id, element.color);
        element.flags.forEach(flag => {
          this.addFlagToOverlay(element.block_id, flag);
        });
      }
    });
  }

  updateStatistics(perspectiveStatistic: ProcessPerspectiveStatistic) {
    if (this.show_statistics) {
      this.blockStatistics.clear();
      perspectiveStatistic.statistics.forEach(element => {
        this.blockStatistics.set(element.id, element);
      });
    } else {
      console.warn("updateStatistics is not enabled since showStatistics is False");
    }
  }

  private generateOverlapHtml(flag: { deviation: string, details: any }, iterationText: string): string {
    const elementId = flag.details.elementId || '';
    const currentOverlaps = flag.details?.over?.map(id => this.getElementNameById(id)) ?? [];

    const overlapText = currentOverlaps.join('\n');
    return `<img src="assets/arrows.png" title="Overlaps:\n${overlapText}${iterationText}" style="transform: rotate(90deg); width:25px; height:25px;">`;
  }

  protected override generateIconHtml(flag: { deviation: string, details: any }): string {
    const hasIteration = flag.details.iterationIndex !== undefined && flag.details.iterationIndex !== -1;
    let iterationText = '';

    if (hasIteration) {
      iterationText = `\nIteration ${flag.details.iterationIndex + 1}`;
    }

    switch (flag.deviation) {
      case 'INCOMPLETE':
        return `<img width="25" height="25" src="assets/hazard.png" title="Incomplete${iterationText}">`;
      case 'MULTI_EXECUTION':
        const count = flag.details?.count ?? '?';
        return `<img width="20" height="20" src="assets/repeat.png" title="Executions: ${count}${iterationText}">`;
      case 'INCORRECT_EXECUTION':
        return `<img width="25" height="25" src="assets/cross.png" title="Incorrect Execution${iterationText}">`;
      case 'INCORRECT_BRANCH':
        return `<img width="25" height="25" src="assets/cross.png" title="Incorrect Branch${iterationText}">`;
      case 'SKIPPED':
        return `<img width="25" height="25" src="assets/skip.webp" title="Skipped${iterationText}">`;
      case 'OVERLAP':
        return this.generateOverlapHtml(flag, iterationText);
      default:
        return '';
    }
  }

  addFlagToOverlay(elementId: string, flag: { deviation: string, details: any }) {
    const elementRegistry = this.bpmnJS.get('elementRegistry');
    const overlays = this.bpmnJS.get('overlays');
    const modeling = this.bpmnJS.get('modeling');
    const elementFactory = this.bpmnJS.get('elementFactory');
    const canvas = this.bpmnJS.get('canvas');

    const element = elementRegistry.get(elementId);
    if (!element) {
      return;
    }

    // Add elementId to flag details for iteration tracking
    flag.details.elementId = elementId;

    const html = this.generateIconHtml(flag);
    const isGateway = element.type.includes('Gateway');

    if (isGateway) {
      const regionElements = this.findGatewayBlock(element);

      if (regionElements.length > 0) {
        const gatewayBlockKey = `${elementId}_gateway_block`;
        let addedShape = this.gatewayBlocks.get(elementId);

        if (!addedShape) {
          const bbox = this.calculateBoundingBoxDirect(regionElements);
          const shape = elementFactory.createShape({
            type: 'bpmn:Group',
            businessObject: {}
          });

          shape.x = bbox.x;
          shape.y = bbox.y;
          shape.width = bbox.width;
          shape.height = bbox.height;

          const rootElement = canvas.getRootElement();
          addedShape = modeling.createShape(shape, { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }, rootElement);

          const gfx = elementRegistry.getGraphics(addedShape);
          const rect = gfx.querySelector('rect');

          if (rect) {
            rect.removeAttribute('style');
            rect.setAttribute('stroke', 'red');
            rect.setAttribute('stroke-width', '2');
            rect.setAttribute('stroke-dasharray', '4,2');
            rect.setAttribute('fill', 'none');
          }

          this.visibleOverlays.set(gatewayBlockKey, addedShape);
          this.gatewayBlocks.set(elementId, addedShape);
        }

        this.updateGatewayIcon(elementId, flag, html, addedShape);
        return;
      }
    }

    this.updateRegularElementIcon(elementId, flag, html);
  }
}