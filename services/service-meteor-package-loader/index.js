"use strict";

const objectql = require('@steedos/objectql');
const core = require('@steedos/core');
const triggerLoader = require('./lib').triggerLoader;
const path = require('path');
const Future = require('fibers/future');
const _ = require('lodash');
/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */

module.exports = {
    name: "service-meteor-package-loader",

    /**
     * Settings
     */
    settings: {
        path: '', // 扫描加载原数据的路径
        name: '' // service name
    },

    /**
     * Dependencies
     */
    dependencies: ['metadata-server'],

    /**
     * Actions
     */
    actions: {

    },

    /**
     * Events
     */
    events: {

    },

	/**
	 * Methods
	 */
	methods: {
		loadPackageMetadataFiles: async function (packagePath, name) {
			await Future.task(async () => {
				let steedosSchema = objectql.getSteedosSchema(this.broker);
				steedosSchema.addMeteorDatasource();
                const datasourceName = 'meteor';
				packagePath = path.join(packagePath, '**');
                const datasource = objectql.getDataSource(datasourceName);
                await datasource.init();
				await objectql.loadStandardMetadata(name, datasourceName);
                await objectql.addAllConfigFiles(packagePath, datasourceName, name);
				await triggerLoader.load(this.broker, packagePath, name);

                let routersData = objectql.loadRouters(packagePath);
                let oldRoutersInfo = await this.broker.call(`@steedos/service-packages.getPackageRoutersInfo`, {packageName: name})

                // routersData.forEach(element => {
                //     if(element.router.default === require('@steedos/router').staticRouter()){
                //         objectql.broker.broker.logger.warn(`router error, packagePath: ${packagePath} `);
                //     }
                // });

                let routersInfo = _.flattenDeep(_.map(routersData, 'infoList'));
                if(oldRoutersInfo){
                    _.each(oldRoutersInfo.metadata, (info)=>{
                        const _info = _.find(routersInfo, (item)=>{
                            return item.path == info.path && JSON.stringify(item.methods) == JSON.stringify(info.methods) && item.md5 == info.md5
                        })
                        if(!_info){
                            core.removeRouter(info.path, info.methods)
                        }
                    })
                }
                const _routers = [];
                routersData.forEach(element => {
                    _routers.push(element)
                });
                core.loadRouters(_routers);

                await this.broker.emit(`translations.object.change`, {});
				return;
			}).promise();
		}
	},

    /**
     * Service created lifecycle event handler
     */
    created() {
        this.logger.debug('service package loader created!!!');
    },

    merged (schema) {
        schema.name = `~packages-${schema.name}`;
    },

    /**
     * Service started lifecycle event handler
     */
    async started() {
        console.time(`service ${this.name} started`)
        let packageInfo = this.settings.packageInfo;
        if (!packageInfo) {
            return;
        }
        const { path } = packageInfo;
        if (!path) {
            this.logger.info(`Please config packageInfo in your settings.`);
            console.log(`service ${this.name} started`);
            return;
        }
        await this.loadPackageMetadataFiles(path, this.name);
        console.timeEnd(`service ${this.name} started`)
        // console.log(`service ${this.name} started`);
    },

    /**
     * Service stopped lifecycle event handler
     */
    async stopped() {
        objectql.deletePackageClientScripts(this.name);
        await this.broker.call(`metadata.refreshServiceMetadatas`, {offlinePackageServices: [
            {
                name: this.name,
                nodeID: this.broker.nodeID,
                instanceID: this.broker.instanceID
            }
            ]}); //this.name
    }
};
