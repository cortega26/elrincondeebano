export interface CommandEnvelope<P = unknown> {
  command_id: string;
  entity_id?: string;
  base_revision?: number;
  issued_at: string;
  payload: P;
}

export interface CommandResult {
  command_id: string;
  status: 'ok' | 'conflict' | 'validation_error' | 'not_found' | 'error';
  resulting_revision?: number;
  changed_fields?: string[];
  validation_issues?: CommandIssue[];
  conflicts?: CommandConflict[];
  warnings?: string[];
  audit_reference?: string;
}

export interface CommandIssue {
  field: string;
  code: string;
  message: string;
}

export interface CommandConflict {
  entity_id: string;
  field: string;
  local_value: unknown;
  base_value: unknown;
  server_value: unknown;
}
