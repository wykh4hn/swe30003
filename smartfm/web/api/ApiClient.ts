/**
 * The presentation tier's single point of contact with the application server.
 *
 * Assignment 3 change C9. Every view calls a named method here rather than
 * building its own `fetch`, which means the token, the JSON headers and — most
 * importantly — the error contract are handled in exactly one place. When the
 * server rejects input, this class raises an `ApiError` carrying the per-field
 * messages, so a form can attach each one to the input that caused it.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors: Readonly<Record<string, string>>;

  constructor(status: number, code: string, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** True when the session has gone and the user must sign in again. */
  get requiresSignIn(): boolean {
    return this.status === 403 && this.code === 'NOT_AUTHORISED';
  }
}

type Json = Record<string, unknown>;

export class ApiClient {
  private token: string | undefined;

  setToken(token: string | undefined): void {
    this.token = token;
  }

  get hasToken(): boolean {
    return this.token !== undefined;
  }


  private async request<T>(method: string, path: string, body?: Json): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token !== undefined) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await fetch(path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'Cannot reach the SmartFM server. Is `npm run server` running on port 4000?');
    }

    const text = await response.text();
    const payload: unknown = text === '' ? {} : JSON.parse(text);

    if (!response.ok) {
      const error = (payload as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string> } })
        .error;
      throw new ApiError(
        response.status,
        error?.code ?? 'UNKNOWN',
        error?.message ?? `Request failed with status ${response.status}.`,
        error?.fieldErrors ?? {},
      );
    }
    return payload as T;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private post<T>(path: string, body?: Json): Promise<T> {
    return this.request<T>('POST', path, body ?? {});
  }

  private patch<T>(path: string, body: Json): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private remove<T>(path: string, body: Json): Promise<T> {
    return this.request<T>('DELETE', path, body);
  }


  signIn(username: string, password: string): Promise<Json> {
    return this.post<Json>('/api/auth/sign-in', { username, password });
  }

  signOut(): Promise<Json> {
    return this.post<Json>('/api/auth/sign-out');
  }

  session(): Promise<Json> {
    return this.get<Json>('/api/auth/session');
  }

  reference(): Promise<Json> {
    return this.get<Json>('/api/reference');
  }

  health(): Promise<Json> {
    return this.get<Json>('/api/health');
  }


  register(body: Json): Promise<Json> {
    return this.post<Json>('/api/customers', body);
  }

  updateProfile(body: Json): Promise<Json> {
    return this.patch<Json>('/api/customers/me', body);
  }

  setNotifications(enabled: boolean): Promise<Json> {
    return this.patch<Json>('/api/customers/me/notifications', { enabled });
  }

  closeAccount(): Promise<Json> {
    return this.post<Json>('/api/customers/me/close');
  }

  notifications(): Promise<Json[]> {
    return this.get<Json[]>('/api/customers/me/notifications');
  }


  branches(): Promise<Json[]> {
    return this.get<Json[]>('/api/branches');
  }

  vehicles(): Promise<Json[]> {
    return this.get<Json[]>('/api/vehicles');
  }

  createVehicle(body: Json): Promise<Json> {
    return this.post<Json>('/api/vehicles', body);
  }

  updateVehicle(id: string, body: Json): Promise<Json> {
    return this.patch<Json>(`/api/vehicles/${id}`, body);
  }

  sendVehicleToMaintenance(id: string, body: Json): Promise<Json> {
    return this.post<Json>(`/api/vehicles/${id}/maintenance`, body);
  }

  returnVehicleToService(id: string): Promise<Json> {
    return this.post<Json>(`/api/vehicles/${id}/return-to-service`);
  }

  retireVehicle(id: string): Promise<Json> {
    return this.post<Json>(`/api/vehicles/${id}/retire`);
  }

  reinstateVehicle(id: string): Promise<Json> {
    return this.post<Json>(`/api/vehicles/${id}/reinstate`);
  }

  transferVehicle(id: string, branchId: string): Promise<Json> {
    return this.post<Json>(`/api/vehicles/${id}/transfer`, { branchId });
  }

  drivers(): Promise<Json[]> {
    return this.get<Json[]>('/api/drivers');
  }

  createDriver(body: Json): Promise<Json> {
    return this.post<Json>('/api/drivers', body);
  }

  updateDriver(id: string, body: Json): Promise<Json> {
    return this.patch<Json>(`/api/drivers/${id}`, body);
  }

  recordDriverLeave(id: string, body: Json): Promise<Json> {
    return this.post<Json>(`/api/drivers/${id}/leave`, body);
  }

  endDriverLeave(id: string): Promise<Json> {
    return this.post<Json>(`/api/drivers/${id}/end-leave`);
  }

  deactivateDriver(id: string): Promise<Json> {
    return this.post<Json>(`/api/drivers/${id}/deactivate`);
  }

  reactivateDriver(id: string): Promise<Json> {
    return this.post<Json>(`/api/drivers/${id}/reactivate`);
  }


  searchAvailability(body: Json): Promise<Json> {
    return this.post<Json>('/api/availability', body);
  }

  reserve(vehicleIds: string[]): Promise<Json[]> {
    return this.post<Json[]>('/api/reservations', { vehicleIds });
  }

  releaseReservation(holdIds: string[]): Promise<Json> {
    return this.remove<Json>('/api/reservations', { holdIds });
  }

  activeReservations(): Promise<Json[]> {
    return this.get<Json[]>('/api/reservations');
  }

  placeOrder(body: Json): Promise<Json> {
    return this.post<Json>('/api/orders', body);
  }

  orders(): Promise<Json[]> {
    return this.get<Json[]>('/api/orders');
  }

  order(id: string): Promise<Json> {
    return this.get<Json>(`/api/orders/${id}`);
  }

  amendOrder(id: string, body: Json): Promise<Json> {
    return this.patch<Json>(`/api/orders/${id}`, body);
  }

  cancelOrder(id: string, reason: string): Promise<Json> {
    return this.post<Json>(`/api/orders/${id}/cancel`, { reason });
  }


  branchQueue(): Promise<Json[]> {
    return this.get<Json[]>('/api/branch/queue');
  }

  branchOrders(): Promise<Json[]> {
    return this.get<Json[]>('/api/branch/orders');
  }

  reviewOrder(id: string): Promise<Json> {
    return this.get<Json>(`/api/branch/orders/${id}/review`);
  }

  acceptOrder(id: string, staffName: string): Promise<Json> {
    return this.post<Json>(`/api/branch/orders/${id}/accept`, { staffName });
  }

  rejectOrder(id: string, staffName: string, reason: string): Promise<Json> {
    return this.post<Json>(`/api/branch/orders/${id}/reject`, { staffName, reason });
  }

  assignmentSuggestions(id: string): Promise<Json[]> {
    return this.get<Json[]>(`/api/branch/orders/${id}/suggestions`);
  }

  assignResources(id: string, assignments: Json[], staffName: string): Promise<Json[]> {
    return this.post<Json[]>(`/api/branch/orders/${id}/assign`, { assignments, staffName });
  }

  dispatchOrder(id: string, staffName: string): Promise<Json> {
    return this.post<Json>(`/api/branch/orders/${id}/dispatch`, { staffName });
  }


  invoices(): Promise<Json[]> {
    return this.get<Json[]>('/api/invoices');
  }

  payInvoice(invoiceId: string, body: Json): Promise<Json> {
    return this.post<Json>(`/api/invoices/${invoiceId}/payments`, body);
  }

  paymentAttempts(invoiceId: string): Promise<Json[]> {
    return this.get<Json[]>(`/api/invoices/${invoiceId}/payments`);
  }

  receipts(): Promise<Json[]> {
    return this.get<Json[]>('/api/receipts');
  }


  tracking(orderId: string): Promise<Json> {
    return this.get<Json>(`/api/orders/${orderId}/tracking`);
  }

  trackByReference(reference: string): Promise<Json> {
    return this.get<Json>(`/api/tracking/${encodeURIComponent(reference)}`);
  }

  driverJobs(): Promise<Json[]> {
    return this.get<Json[]>('/api/driver/jobs');
  }

  postDriverUpdate(body: Json): Promise<Json> {
    return this.post<Json>('/api/driver/updates', body);
  }


  shipmentReport(query: string): Promise<Json> {
    return this.get<Json>(`/api/reports/shipments?${query}`);
  }

  resourceReport(query: string): Promise<Json> {
    return this.get<Json>(`/api/reports/resources?${query}`);
  }
}
