import type { VercelRequestLike, VercelResponseLike } from "../_http.js";

const script = `self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{let data={};try{data=event.data?event.data.json():{}}catch{}const title="NeoContent";const options={body:String(data.body||"An item requires your attention."),icon:"/api/operator/icon",badge:"/api/operator/icon",tag:String(data.tag||"neo-action-required"),renotify:true,data:{url:"/api/operator?view=action"}};event.waitUntil(Promise.all([self.registration.showNotification(title,options),self.navigator.setAppBadge?self.navigator.setAppBadge(1):Promise.resolve()]));});
self.addEventListener("notificationclick",event=>{event.notification.close();if(self.navigator.clearAppBadge)self.navigator.clearAppBadge();const target="/api/operator?view=action";event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{for(const client of clients){if(new URL(client.url).origin===self.location.origin){client.navigate(target);return client.focus();}}return self.clients.openWindow(target);}));});`;

export default function handler(request: VercelRequestLike, response: VercelResponseLike) {
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  response.setHeader?.("content-type", "application/javascript; charset=utf-8");
  response.setHeader?.("cache-control", "no-cache, no-store, must-revalidate");
  response.setHeader?.("service-worker-allowed", "/api/operator");
  response.send?.(script);
}
