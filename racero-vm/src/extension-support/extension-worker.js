/* eslint-env worker */

const ArgumentType = require('../extension-support/argument-type');
const BlockType = require('../extension-support/block-type');
const dispatch = require('../dispatch/worker-dispatch');
const TargetType = require('../extension-support/target-type');

class ExtensionWorker {
    constructor () {
        this.nextExtensionId = 0;

        this.initialRegistrations = [];

        dispatch.waitForConnection.then(() => {
            dispatch.call('extensions', 'allocateWorker').then(x => {
                const [id, extension] = x;
                this.workerId = id;

                try {
                    importScripts(extension);

                    const initialRegistrations = this.initialRegistrations;
                    this.initialRegistrations = null;

                    Promise.all(initialRegistrations).then(() => dispatch.call('extensions', 'onWorkerInit', id));
                } catch (e) {
                    dispatch.call('extensions', 'onWorkerInit', id, e);
                }
            });
        });

        this.extensions = [];
    }

    register (extensionObject) {
        const extensionId = this.nextExtensionId++;
        this.extensions.push(extensionObject);
        const serviceName = `extension.${this.workerId}.${extensionId}`;
        const promise = dispatch.setService(serviceName, extensionObject)
            .then(() => dispatch.call('extensions', 'registerExtensionService', serviceName));
        if (this.initialRegistrations) {
            this.initialRegistrations.push(promise);
        }
        return promise;
    }
}

global.Racero = global.Racero || {};
global.Racero.ArgumentType = ArgumentType;
global.Racero.BlockType = BlockType;
global.Racero.TargetType = TargetType;

/**
 * Expose only specific parts of the worker to extensions.
 */
const extensionWorker = new ExtensionWorker();
global.Racero.extensions = {
    register: extensionWorker.register.bind(extensionWorker)
};
