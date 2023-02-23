import dotenv from 'dotenv';
dotenv.config();

import {
  initInstrumentation,
  createSpan,
} from '@metronetinc/node-express-opentelemetry-package/src/index';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import express, { Request, Response } from 'express';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import axios from 'axios';
import api from '@opentelemetry/api';
import opentelemetry from '@opentelemetry/sdk-node';
import httpContext from 'express-http-context';

const consoleSpanExporter = new ConsoleSpanExporter();
const zipkinSpanExporter = new ZipkinExporter({
  url: 'http://localhost:9411/api/v2/spans',
  serviceName: process.env.npm_package_name,
});

initInstrumentation(undefined, zipkinSpanExporter);

const app = express();

const tracer = api.trace.getTracer(process.env.npm_package_name as string);

function traceMiddleware(req: any, res: any, next: any) {
  const span = tracer.startSpan(req.path);
  //   api.context.with(api.trace.setSpan(api.context.active(), span), () => {
  //     span.addEvent('request received');
  //     next();
  //   });
  const { headers } = req;
  const spanOptions: any = {};
  const spanContext = api.propagation.extract(api.context.active(), headers);
  if (spanContext) {
    spanOptions.parent = spanContext;
  }

  const requestSpan = tracer.startSpan(`${req.method} ${req.url}`, spanOptions);

  requestSpan.setAttribute('http.method', req.method);
  requestSpan.setAttribute('http.user_agent', req.get('User-Agent'));

  const previousRequestSpan = httpContext.get('REQUEST_SPAN') || [];

  httpContext.set('REQUEST_SPAN', [...previousRequestSpan, requestSpan]);
  res.once('finish', () => {
    requestSpan.setAttribute('http.status_code', res.statusCode);
    requestSpan.end();
  });

  next();
}

app.use(traceMiddleware);

app.get('/', async (_req, res) => {
  console.log('hello');
  const span = createSpan('hello-span-calling-another-service');
  const headers = {};
  api.propagation.inject(api.context.active(), headers);
  span.addEvent('request sent');
  const response = await axios.get('http://localhost:8080/another', {
    headers: {
      ...headers,
      remote: 'true',
    },
  });
  span.addEvent('response received');
  span.end();
  res.send(response.data);
});

app.listen(5000, () => {
  console.log('running on port 5000');
});
