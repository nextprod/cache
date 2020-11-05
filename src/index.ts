import fs from 'promise-fs';
import path from 'path';
import tar from 'tar'

const outputDir = process.env.NEX_STEP_OUTPUT_DIR || __dirname;
const workspace = process.env.NEX_WORKSPACE || __dirname;

type Save = {
    paths: string | Array<string>,
    key: string,
}
type Restore = string
type Parameters = {
  save?: Save,
  restore?: Restore
}

type Event = {
    parameters: Parameters,
}

export async function run(event: Event) {
    const params = event.parameters;
    const dir = path.resolve(workspace, "../.nex-cache")
    if (!fs.existsSync(dir)) {
        throw new Error(`Cache directory ${dir} was not mounted.`)
    }
    // Select a command.
    if (params.save) {
        return await save(dir, params.save)
    } else if(params.restore) {
        return await restore(dir, params.restore)
    }
    throw new Error("Operation was not specified. Either save or restore is accepted.")
}

// Save cache by iterating over all paths, making
// an archive and placing it on shared file system or
// local directory.
const save = async (dir: string, params: Save):Promise<Error|void> => {
    let paths = Array.isArray(params.paths) ? params.paths : [params.paths];
    paths = paths.map(p => path.join(workspace, p))
    try {
        console.log("Save...")
        // Archive is identified by key which is supposed to be
        // a checksum of of lock file.
        const archive = path.join(dir, params.key)
        // Create an archive.
        await tar.c({
            file: `${archive}.tgz`,
            cwd: workspace,
            preservePaths: true,
        }, paths);
        console.log(`Cache stored: ${params.key}`)
    } catch (err) {
        throw new Error(err)
    }
}

// Restore cache.
const restore = async (dir: string, key: Restore):Promise<Error|void> => {
    try {
        const src = path.join(dir, `${key}.tgz`)
        if (!fs.existsSync(src)) {
            return await writeOutput(false)
        }
        // Cache hit.
        await writeOutput(true)
        const dest = path.resolve(workspace, `${key}.tgz`)
        // Now copy an archive from cache directory to workspace, extract it
        // and remove original tar.gz.
        console.log(`Restoring cache from ${src} to ${dest}`)
        fs.copyFileSync(src, dest)
        await tar.x({
            file: dest,
            cwd: process.platform === "win32" ? "\\" : "/",
        })
        fs.unlinkSync(dest)
    } catch (err) {
        return err
    }
}

const writeOutput = async (hit: boolean) => {
    const filepath = path.resolve(path.join(outputDir, "hit.json"))
    // Write secrets to json file.
    await fs.writeFileSync(filepath, JSON.stringify({value: hit}))
}