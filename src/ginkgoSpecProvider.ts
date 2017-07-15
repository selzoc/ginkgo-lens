'use strict';

import * as vscode from 'vscode';

import cp = require('child_process');
import path = require('path')
import { getGinkgoPath } from './ginkgoTestRunner'

export enum GinkgoTestKind {
	Describe = 0,
	It = 1
}

interface Spec {
	ConcatenatedString: string;
	Location: vscode.Location;
}

export function getTestSpecs(doc: vscode.TextDocument): Thenable<vscode.SymbolInformation[]> {
	return new Promise((resolve, reject) => {
		const ginkgooRuntimePath = getGinkgoPath();
		if (!ginkgooRuntimePath) {
			vscode.window.showErrorMessage('Not able to find "ginkgo" binary in GOPATH');
			reject();
			return;
		}

		const dir = path.dirname(doc.fileName);
		const spawnedGinkgo = cp.spawnSync(
			ginkgooRuntimePath,
			['-regexScansFilePath', '-noisyPendings=false', '-noColor', '-dryRun', '-v', `-focus="${doc.fileName}"`],
			{ cwd: dir, shell: true }
		);

		if (spawnedGinkgo.status !== 0) {
			reject('ginkgo exit code error');
			return;
		}

		const specs = getSpecsFromOutput(spawnedGinkgo.stdout.toString(), doc);
		resolve(specs.map(s =>
			new vscode.SymbolInformation(
				s.ConcatenatedString,
				vscode.SymbolKind.Function,
				`${path.basename(doc.fileName)}`,
				s.Location
			)));
	});
}

function getSpecsFromOutput(output: string, doc: vscode.TextDocument): Spec[] {
	const specLines = output.split('\n').filter(ginkgoOutputFilter).map(s => s.trim());
	const specIndices = getTestIndices(doc.getText(), GinkgoTestKind.It);

	const specs: Spec[] = [];
	for (let i = 0; i < specLines.length; i += 3) {
		specs.push({
			ConcatenatedString: `${specLines[i]} ${specLines[i + 1]} ${specLines[i + 2].split(':')[0]}`,
			Location: new vscode.Location(doc.uri, doc.positionAt(specIndices[i / 3]))
		});
	}

	return specs;
}

function ginkgoOutputFilter(line: string): boolean {
	const trimmed = line.trim();

	if (trimmed.length === 0 ||
		trimmed.startsWith('Running Suite:') ||
		trimmed.startsWith('Random Seed') ||
		trimmed.startsWith('Will run') ||
		trimmed.startsWith('SUCCESS!') ||
		trimmed.startsWith('Ginkgo ran') ||
		trimmed.startsWith('Test Suite') ||
		trimmed.startsWith('•') ||
		/^Ran \d+ of \d+ Specs in/.test(trimmed) ||
		/^S+$/.test(trimmed) ||
		/^-+$/.test(trimmed) ||
		/^=+$/.test(trimmed)) {
		return false;
	}

	return true;
}

function getTestIndices(docText: string, testKind: GinkgoTestKind): number[] {
	let testString = 'It(';
	if (testKind === GinkgoTestKind.Describe) {
		testString = 'Describe(';
	}

	const indices = [];
	let i = 0;
	while (i !== -1) {
		const loc = docText.indexOf(testString, i)
		if (loc == -1) {
			break;
		}

		indices.push(loc);
		i = loc + 1;
	}

	return indices;
}