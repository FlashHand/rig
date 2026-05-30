import print from '../print';

export default function crewStub(name: string): () => void {
  return () => {
    print.warn(`rig orchestrate ${name} is not implemented yet.`);
    print.info('Current MVP supports init, status, pending-questions, board, sync, doctor, ask, and project add/list/status.');
  };
}

