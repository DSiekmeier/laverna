/**
 * @module components/importExport/Import
 */
import Mn from 'backbone.marionette';
import _ from 'underscore';
import Radio from 'backbone.radio';
import JSZip from 'jszip';

import deb from 'debug';

const log = deb('lav:components/importExport/Import');

/**
 * Import data to Laverna from a ZIP archive.
 *
 * @class
 * @extends Marionette.Object
 * @license MPL-2.0
 */
export default class Import extends Mn.Object {

    init() {
        // Do nothing if there aren't any ZIP archives
        if (!this.checkFiles()) {
            return Promise.resolve();
        }

        return this.readZip(this.options.files[0])
        .then(zip => this.import(zip))
        .then(() => document.location.reload())
        .catch(err => log('error', err));
    }

    /**
     * Check if the provided files are ZIP archives.
     *
     * @returns {Boolean}
     */
    checkFiles() {
        const {files} = this.options;
        return (!!files && !!files.length && this.isZipFile(files[0]));
    }

    /**
     * Check if a file is a ZIP archive.
     *
     * @param {Object} file
     * @param {Object} file.type
     * @param {Object} file.name
     */
    isZipFile(file) {
        return (
            file.type === 'application/zip' ||
            _.last(file.name.split('.')) === 'zip'
        );
    }

    /**
     * Read a ZIP archive.
     *
     * @param {Object} file
     * @returns {Promise} resolves with JSZip instance
     */
    readZip(file) {
        const reader = new FileReader();
        this.zip     = new JSZip();

        return new Promise((resolve, reject) => {
            reader.onload = evt => {
                this.zip.loadAsync(evt.target.result)
                .then(() => resolve(this.zip))
                .catch(err => reject(err));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Import files from a ZIP archive.
     *
     * @param {Object} zip
     * @returns {Promise}
     */
    import(zip) {
        const promises = [];

        _.each(zip.files, file => {
            // Ignore directories and non JSON files
            if (file.dir || _.last(file.name.split('.')) !== 'json') {
                return;
            }

            promises.push(this.readFile(zip, file));
        });

        return Promise.all(promises);
    }

    /**
     * Read a file from the ZIP archive.
     *
     * @param {Object} zip
     * @param {Object} file
     * @returns {Promise}
     */
    readFile(zip, file) {
        return zip.file(file.name).async('string')
        .then(res => {
            const path      = file.name.split('/');
            const profileId = path[1];
            const data      = JSON.parse(res);

            if (path[2] === 'notes') {
                return this.importNote({zip, profileId, data, name: file.name});
            }
            else {
                const type = path[2].split('.json')[0];
                return this.importCollection({profileId, data, type});
            }
        });
    }

    /**
     * Import a note to database.
     *
     * @param {Object} options
     * @param {Object} options.zip - JSZip instance
     * @param {String} options.name - file name of a note
     * @param {String} options.profileId
     * @param {Object} options.data
     * @returns {Promise}
     */
    importNote(options) {
        const {data, profileId} = options;
        const name = options.name.replace(/\.json$/, '.md');

        // Read a note's content from a Markdown file
        return options.zip.file(name).async('string')
        .then(content => {
            data.content = content;

            return Radio.request('collections/Notes', 'saveModelObject', {
                data,
                profileId,
            });
        });
    }

    /**
     * Import a collection to database.
     *
     * @param {Object} options
     * @param {String} options.type - collection name (notebooks, tags, configs...)
     * @param {String} options.profileId
     * @param {Object} options.data
     * @returns {Promise}
     */
    importCollection(options) {
        // Do nothing if the collection name is incorrect
        const types = ['notebooks', 'tags', 'configs'];
        if (_.indexOf(types, options.type) === -1) {
            return Promise.resolve();
        }

        const type = _.capitalize(options.type);

        return Radio.request(`collections/${type}`, 'saveFromArray', {
            profileId : options.profileId,
            values    : options.data,
        });
    }

}
