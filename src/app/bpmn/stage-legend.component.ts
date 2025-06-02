import { Component, Input } from '@angular/core';

interface LegendItem {
  color: any;
  label: string;
  description?: string;
}

@Component({
  selector: 'app-stage-legend',
  template: `
    <div class="legend-container" *ngIf="legendItems.length > 0">
      <div class="legend-header">
        <span class="legend-title">Deviation Rate Legend</span>
      </div>
      <div class="legend-items">
        <div 
          class="legend-item" 
          *ngFor="let item of legendItems"
          [title]="item.description"
        >
          <div 
            class="legend-color-box"
            [style.background-color]="item.color?.fill || '#ffffff'"
          ></div>
          <span class="legend-label">{{ item.label }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .legend-container {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      margin: 8px 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .legend-header {
      padding: 8px 12px;
      background: #e9ecef;
      border-bottom: 1px solid #dee2e6;
    }

    .legend-title {
      font-size: 13px;
      font-weight: 600;
      color: #495057;
    }

    .legend-items {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding: 10px 12px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      cursor: help;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background-color 0.2s;
    }

    .legend-item:hover {
      background: rgba(0,0,0,0.05);
    }

    .legend-color-box {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
      border: 1px solid #ddd;
    }

    .legend-label {
      color: #495057;
      white-space: nowrap;
    }

    /* Responsive layout */
    @media (max-width: 768px) {
      .legend-items {
        flex-direction: column;
        gap: 6px;
      }
    }
  `]
})
export class StageLegendComponent {
  @Input() legendItems: LegendItem[] = [];
}