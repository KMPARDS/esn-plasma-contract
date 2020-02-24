/*
  Author: Soham Zemse (https://github.com/zemse)
  This script reads your contracts written in contracts folder and compiles them only if you made any changes, creating a standard JSON output file in the build folder.
  USAGE:
  node compile.js (only for compiling)
  npm run test (for compiling + running tests)
*/

const path = require('path');
const fs = require('fs-extra');
const solc = require('solc');
const ethers = require('ethers');

const filesToIgnore = {'.DS_Store': true};

const sourceFolderPath = path.resolve(__dirname, 'contracts');
const buildFolderPath = path.resolve(__dirname, 'build');
const lastSourceHashFilePath = path.resolve(__dirname, 'sst-config.json');

const getContractSource = contractFileName => {
  const contractPath = path.resolve(__dirname, 'contracts', contractFileName);
  const source = fs.readFileSync(contractPath, 'utf8');
  return source;
};

let sources = {};

function addSourcesFromThisDirectory(relativePathArray = []) {
  const pathArray = [sourceFolderPath, ...relativePathArray];
  fs.readdirSync(path.resolve(sourceFolderPath, ...relativePathArray)).forEach(childName => {
    if(filesToIgnore[childName]) return;
    const childPathArray = [...relativePathArray, childName];
    // console.log({childPathArray});
    if(fs.lstatSync(path.resolve(sourceFolderPath, ...childPathArray)).isDirectory()) {
      addSourcesFromThisDirectory(childPathArray);
    } else {
      sources = {
        ...sources,
        [childPathArray.join('/')]: {
          content: fs.readFileSync(path.resolve(sourceFolderPath, ...childPathArray), 'utf8')
        }
      }
    }
  });
}

addSourcesFromThisDirectory();

// console.log({sources});

function convertToHex(inputString) {
  var hex = '';
  for(var i=0;i<inputString.length;i++) {
    hex += ''+inputString.charCodeAt(i).toString(16);
  }
  return hex;
}

const sourceHash = ethers.utils.sha256('0x'+convertToHex(JSON.stringify(sources)));

console.log('\n'.repeat(process.stdout.rows));

if(fs.existsSync(buildFolderPath)
  && fs.existsSync(lastSourceHashFilePath)
  && (JSON.parse(fs.readFileSync(lastSourceHashFilePath, 'utf8'))).sourceHash === sourceHash) {
  console.log('No changes in .sol files detected... \nSkiping compile script...\n');
} else {
  // write the source hash there at the end of
  // console.log(lastSourceHash,sourceHash);

  const input = {
      language: 'Solidity',
      sources,
      settings: {
          outputSelection: {
              '*': {
                  '*': [ '*' ]
              }
          }
      }
  }

  console.log('Compiling contracts...');
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  console.log('Done');

  let shouldBuild = true;

  if (output.errors) {
    // console.error(output.errors);
    for(error of output.errors) {
      console.log('-'.repeat(process.stdout.columns));
      console.group(error.severity.toUpperCase());
      console.log(error.formattedMessage);
      console.groupEnd();
    }
    if(Object.values(output.errors).length) console.log('-'.repeat(process.stdout.columns));
    // throw '\nError in compilation please check the contract\n';
    for(error of output.errors) {
      if(error.severity === 'error') {
        shouldBuild = false;
        throw 'Error found\n';
        break;
      }
    }
  }

  if(shouldBuild) {
    console.log('\nBuilding please wait...');

    fs.removeSync(buildFolderPath);
    fs.ensureDirSync(buildFolderPath);

    let i = 0;
    for (let contractFile in output.contracts) {
      for(let key in output.contracts[contractFile]) {
        //console.log(key, Object.keys(output.contracts[contractFile][key]));
        fs.outputJsonSync(
          path.resolve(buildFolderPath, `${contractFile.split('.')[0]}_${key}.json`),
          output.contracts[contractFile][key]
        );

      }
      i++;
    }
    console.log('Build finished successfully!\n');
  } else {
    console.log('\nBuild failed\n');
  }

  fs.outputJsonSync(
    path.resolve(lastSourceHashFilePath),
    { sourceHash }
  );
}
