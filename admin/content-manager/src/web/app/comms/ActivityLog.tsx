import {
  COMMS_STATUS_LABELS,
  type CommsActivity,
} from '../../../shared/schemas/comms.ts';
import { relativeTime } from './useCommsWorkspace.ts';

export function ActivityLog({ activity }: { activity: CommsActivity[] }): React.ReactElement {
  return (
    <details className="comms-panel">
      <summary>Historial ({activity.length})</summary>
      <p className="comms-hint">
        Solo registra acciones en esta app. WhatsApp no informa entregas ni lecturas.
      </p>
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Mensaje</th>
            <th>Destino</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {activity.slice(0, 50).map((a) => (
            <tr key={a.id}>
              <td>{relativeTime(a.at)}</td>
              <td>{a.template_title}</td>
              <td>{a.destination_alias}</td>
              <td>{COMMS_STATUS_LABELS[a.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
