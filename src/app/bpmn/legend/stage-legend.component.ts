import { Component, Input } from '@angular/core';

interface LegendItem {
  color: any;
  label: string;
  description?: string;
}

@Component({
  selector: 'app-stage-legend',
  templateUrl: './stage-legend.component.html',
  styleUrls: ['./stage-legend.component.scss']
})

export class StageLegendComponent {
  @Input() legendItems: LegendItem[] = [];
}