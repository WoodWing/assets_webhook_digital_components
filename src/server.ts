import express = require('express');
import http = require('http');
import fs = require('fs');
import { Application } from 'express';
import bodyParser = require('body-parser');
import { Config } from './config';
import { ElvisApi } from './elvis-api/api';
import { ApiManager } from './elvis-api/api-manager';
import uuidV4 = require('uuid/v4');

class Server {
    private static instance: Server;

    public static getInstance(): Server {
        return this.instance || (this.instance = new this());
    }

    private app: Application;
    private httpApp: Application;
    private apiManager: ElvisApi = ApiManager.getApi();

    private constructor() {
        this.httpApp = express();
        this.app = this.httpApp;
    }

    public start(): void {
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(bodyParser.json());
        this.app.use(this.allowCrossDomain);

        http.createServer(this.httpApp).listen(Config.httpPort, () => {
            this.logStartupMessage('HTTP Server started at port: ' + Config.httpPort);
        });

        this.app.post('/', async (req, res) => {
            try {
                const file = await this.downloadFile(`${Config.elvisUrl}/api/asset/${req.body.assetId}/original`, `dump/${req.body.assetId}_${uuidV4()}.json`)
                const article = JSON.parse(fs.readFileSync(file, "utf8"));
                let metadata = JSON.parse(JSON.stringify(Config.fields));
                article.data.content.forEach(component => {
                    if (!metadata.cf_components.includes(component.identifier)) metadata.cf_components.push(component.identifier);
                    if (["title", "subtitle", "hero", "headline", "author", "crosshead", "quote", "recipe", "ingredients"].includes(component.identifier))
                        for (const identifier in component.content) {
                            if (!(["title", "recipe", "subtitle", "author"].includes(identifier) || (["crosshead", "quote", "title", "recipe"].includes(component.identifier) && identifier == "text"))) continue;
                            const tag = `cf_${identifier == "text" ? component.identifier : identifier}`;
                            if (typeof metadata[tag] != "object" || (component.identifier == "quote" && identifier == "author")) continue;
                            let str = JSON.stringify(component.content[identifier]);
                            let end = "";
                            while (str.indexOf('"insert":"') > -1) {
                                str = str.substr(str.indexOf('"insert":"') + 10);
                                let val = str.slice(0, str.indexOf('"'));
                                end += val;
                            }
                            metadata[tag].push(end.trim());
                        }

                        if (component.identifier == "recipe") {
                        }

                        if (component.identifier == "ingredients") {
                            for (const i in component.containers.main) {
                                
                                const ingredient = component.containers.main[i];
                                if (ingredient.content.notes) {
                                    console.log('ingredients', JSON.stringify(ingredient.content.notes[0]));
                                    metadata['cf_ingredients'].push(ingredient.content.notes[0].insert);
                                }
                            };
                        }
                });
                for (const field in metadata) metadata[field] = metadata[field].filter(Boolean)
                console.log(metadata)
                this.apiManager.update(req.body.assetId, JSON.stringify(metadata));
                res.sendStatus(200);
                fs.unlinkSync(file);
            } catch (e) {
                console.error(e);
                res.sendStatus(200);
            }
        });
    }

    private async downloadFile(url: string, destination: string): Promise<string> {
        return await this.createDestinationDirectory(destination).then(async () => {
            return await this.apiManager.elvisRequest.requestFile(url, destination);
        });
    }

    private createDestinationDirectory(file: string): Promise<string> {
        let dir: string = require('path').dirname(file);
        return new Promise<string>((resolve, reject) => {
            fs.mkdir(dir, error => {
                if (!error || (error && error.code === 'EEXIST')) {
                    resolve(dir);
                }
                else {
                    reject(error);
                }
            });
        });
    }

    private logStartupMessage(serverMsg: string): void {
        console.info('Running NodeJS ' + process.version + ' on ' + process.platform + ' (' + process.arch + ')');
        console.info(serverMsg);
    }

    private allowCrossDomain = (req, res, next) => {
        req = req;

        res.header('Access-Control-Allow-Origin', Config.corsHeader);
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept');

        next();
    }
}


let server: Server = Server.getInstance();
server.start();
