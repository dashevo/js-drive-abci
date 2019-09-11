const grpc = require('grpc');

const {
  service: healthCheckServiceDefinition,
  Implementation: HealthCheck,
} = require('grpc-health-check/health');

const {
  HealthCheckResponse: { ServingStatus: healthCheckStatuses },
} = require('grpc-health-check/v1/health_pb');

const { utils: { loadPackageDefinition } } = require('@dashevo/drive-grpc');

/**
 * @typedef createServer
 * @param {string} serviceName
 * @param {Object.<string, Function>} handlers
 * @return {module:grpc.Server}
 */
function createServer(serviceName, handlers) {
  const server = new grpc.Server();

  // Add health check service

  const statusMap = {
    '': healthCheckStatuses.SERVING,
    [`org.dash.platform.drive.${serviceName}`]: healthCheckStatuses.SERVING,
  };

  server.addService(healthCheckServiceDefinition, new HealthCheck(statusMap));

  // Add Service service

  const { org: { dash: { platform: { drive: { v1: { [serviceName]: Service } } } } } } = loadPackageDefinition(serviceName);

  server.addService(Service.service, handlers);

  return server;
}

module.exports = createServer;